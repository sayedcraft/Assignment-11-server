require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.at2amoq.mongodb.net/?appName=Cluster0`;

// Middleware 
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  }),
);

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

    // Get all books
    app.get("/books", async (req, res) => {
      const cursor = booksCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Add a book
    app.post("/books", async (req, res) => {
      const bookData = req.body;
      const result = await booksCollection.insertOne(bookData);
      res.send(result);
    });

    // Get specific book
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const result = await booksCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Payment session API
    app.post("/create-checout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo?.title || "Book Purchase",
                description: paymentInfo?.description || "No description available",
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

      res.send({ url: session.url });
    });

    // Payment success webhook setup
    app.post("/paymentSuccess", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const book = await booksCollection.findOne({
        _id: new ObjectId(session.metadata.bookId),
      });

      const order = await orderCollection.findOne({
        transactionId: session.payment_intent,
      });

      if (session.status === "complete" && book && !order) {
        const orderInfo = {
          bookId: session.metadata.bookId,
          transactionId: session.payment_intent,
          customer: session.metadata.librarianEmail,
          orderStatus: "success", 
          paymentStatus: "paid",
          amount: session.amount_total / 100,
          name: book.title,
          author: book.author,
          image: book.image,
          createdAt: new Date().toISOString(), 
        };
        await orderCollection.insertOne(orderInfo);
      }
      res.send(book);
    });

    // ----------------------------------------------------
    // Cancel an Order Route 
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { orderStatus: "cancelled" }
      };
      const result = await orderCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // ----------------------------------------------------

    // Get orders for customer
    app.get("/myOrder/:email", async (req, res) => {
      const email = req.params.email;
      const result = await orderCollection.find({ customer: email }).toArray();
      res.send(result);
    });

    // for Invoice
    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { 
        customer: email, 
        paymentStatus: "paid", 
        orderStatus: "success" 
      };
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    }); 

    // Get books for librarian
    app.get("/myBook/:email", async (req, res) => {
      const email = req.params.email;
      const result = await booksCollection
        .find({ "librarian.email": email })
        .toArray();
      res.send(result);
    });

    // Save user state in DB
    app.post("/user", async (req, res) => {
      const userData = req.body;

      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      userData.role = "user";

      const query = { email: userData.email };
      const alreadyExists = await userCollection.findOne(query);

      if (alreadyExists) {
        const result = await userCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        });
        return res.send(result);
      }

      const result = await userCollection.insertOne(userData);
      res.send(result);
    });

    // Get user role
    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send({ role: result?.role || "user" });
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const adminEmail = req.query.email;

      let query = {};
      if (adminEmail) {
        query = { email: { $ne: adminEmail } };
      }

      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Update user role
    app.patch("/update-role", async (req, res) => {
      const { email, role } = req.body;
      const query = { email: email };
      const updateDoc = { $set: { role: role } };

      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Connect the client to the server
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Book server is running");
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});