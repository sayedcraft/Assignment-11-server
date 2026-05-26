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
    origin: [
    "http://localhost:5173",              
    "https://book-courier-74d78.web.app",       
    "https://book-courier-74d78.firebaseapp.com" 
  ],
  credentials: true
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

    // letast bok for home
    app.get("/latest-books", async (req, res) => {
      const result = await booksCollection
        .find()
        .sort({ _id: -1 })
        .limit(8)
        .toArray();
      res.send(result);
    });

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

    // oder
    app.post("/orders", async (req, res) => {
      const orderInfo = req.body;
      const finalOrder = {
        ...orderInfo,
        orderStatus: "pending",
        paymentStatus: "unpaid",
        createdAt: new Date().toISOString(),
      };
      const result = await orderCollection.insertOne(finalOrder);
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
          orderId: paymentInfo.orderId,
          bookId: paymentInfo.bookId,
          librarianEmail: paymentInfo?.customer || "",
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

      if (session.status === "complete") {
        const orderId = session.metadata.orderId;

        const query = { _id: new ObjectId(orderId) };
        const updateDoc = {
          $set: {
            orderStatus: "success",
            paymentStatus: "paid",
            transactionId: session.payment_intent,
            amount: session.amount_total / 100,
          },
        };

        await orderCollection.updateOne(query, updateDoc);

        const book = await booksCollection.findOne({
          _id: new ObjectId(session.metadata.bookId),
        });
        res.send(book);
      } else {
        res.status(400).send({ message: "Payment failed" });
      }
    });

    // ----------------------------------------------------
    // Cancel an Order Route
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { orderStatus: "cancelled" },
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
        orderStatus: "success",
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

    //Librarian ordar control
    app.get("/librarian/orders/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const librarianBooks = await booksCollection
          .find({ "librarian.email": email })
          .toArray();

        const bookIds = librarianBooks.map((book) => book._id.toString());

        const query = { bookId: { $in: bookIds } };

        const result = await orderCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch librarian orders", error });
      }
    });

    //orderStatus
    app.patch("/orders/update-status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { orderStatus: status },
        };

        const result = await orderCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to update order status", error });
      }
    });

    // Book Update API
    app.put("/books/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedBook = req.body;

        const updateDoc = {
          $set: {
            title: updatedBook.title,
            author: updatedBook.author,
            image: updatedBook.image,
            price: updatedBook.price,
            status: updatedBook.status,
          },
        };

        const result = await booksCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update book", error });
      }
    });

    // AllBook for admin
    app.get("/admin/all-books", async (req, res) => {
      const result = await booksCollection.find().toArray();
      res.send(result);
    });

    // delete book by admin
    app.delete("/admin/books/:id", async (req, res) => {
      const id = req.params.id;
      const bookIdStr = id.toString();

      await orderCollection.deleteMany({ bookId: bookIdStr });

      const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // p/up by admin
    app.patch("/admin/books/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body; // ফ্রন্টএন্ড থেকে 'Published' বা 'Unpublished' আসবে

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };

      const result = await booksCollection.updateOne(filter, updateDoc);
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
