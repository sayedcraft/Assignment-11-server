require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.at2amoq.mongodb.net/?appName=Cluster0`;

// middlewere
app.use(express.json());
app.use(cors());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("booksDB");
    const booksCollection = db.collection("books");
    const orderCollection = db.collection("orders");
    const userCollection = db.collection("users");

    app.post("/books", async (req, res) => {
      const bookData = req.body;
      const result = await booksCollection.insertOne(bookData);
      res.send(result);
    });

    app.get("/books", async (req, res) => {
      const cursor = booksCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const result = await booksCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // payment related api
    app.post("/create-checout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price) * 100;
      // console.log(paymentInfo);
      // res.send(paymentInfo)

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo?.title || "Book Purchase",
                description:
                  paymentInfo?.description || "No description available",
                images: [paymentInfo?.image],
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          bookId: paymentInfo.bookId,
          librarianEmail: paymentInfo?.librarian?.Lemail || "",
        },
        success_url: `${process.env.SITE_DOMAIN}/paymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/paymentCancel`,
      });

      // console.log(session);
      res.send({ url: session.url });
    });

    app.post("/paymentSuccess", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(session);
      const book = await booksCollection.findOne({
        _id: new ObjectId(session.metadata.bookId),
      });

      const order = await orderCollection.findOne({
        transactionId: session.payment_intent,
      });

      // save order data in db
      if (session.status === "complete" && book && !order) {
        const orderInfo = {
          bookId: session.metadata.bookId,
          transactionId: session.payment_intent,
          customer: session.metadata.librarianEmail,
          status: "pending",
          amount: session.amount_total / 100,
          name: book.title,
          author: book.author,
          image: book.image,
          time: book.createdAt,
        };
        console.log(orderInfo);
        const result = await orderCollection.insertOne(orderInfo);
      }
      res.send(book);
    });

    // get alll order for a customer by email
    app.get("/myOrder/:email", async (req, res) => {
      const email = req.params.email;
      const result = await orderCollection.find({ customer: email }).toArray();
      res.send(result);
    });

    // get all book for a librarian by email
    app.get("/myBook/:email", async (req, res) => {
      const email = req.params.email;
      const result = await booksCollection
        .find({ "librarian.email": email })
        .toArray();
      res.send(result);
    });

    // user in db
    app.post("/user", async (req, res) => {
      const userData = req.body;
      // console.log(userData);

      userData.created_at =new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();

      const query={
          email: userData.email,
      }

      const alreadyExists = await userCollection.findOne(query);
      if(alreadyExists){
        const result = await userCollection.updateOne(query,{
          $set:{
            last_loggedIn : new Date().toISOString(),
          },
        })
        return res.send(result);
      }

      const result = await userCollection.insertOne(userData);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Book server is running");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
