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

    // payment
    app.post("/create-checout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price) * 100;
      console.log(paymentInfo);
      // res.send(paymentInfo)

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                  name: paymentInfo?.title || "Book Purchase",
                  description: paymentInfo?.description || "No description available",
                  images: [paymentInfo?.image] ,
                },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          bookId: paymentInfo.bookId,
        },
        success_url: `${process.env.SITE_DOMAIN}/paymentSuccess`,
        cancel_url: `${process.env.SITE_DOMAIN}/paymentCancel`,
      });

      console.log(session);
      res.send({ url: session.url });
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
