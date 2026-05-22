const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

const uri = "mongodb+srv://books_db:9BVaEPfMZOidy9hu@cluster0.at2amoq.mongodb.net/?appName=Cluster0";

// middlewere
app.use(express.json());
app.use(cors());


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {

    const db = client.db('booksDB')
    const booksCollection= db.collection('books')

    app.post('/books',async(req,res)=>{
      const bookData=req.body
      const result=await booksCollection.insertOne(bookData)
      res.send(result)
    })

    app.get('/books',async(req,res)=>{
      const cursor = booksCollection.find()
      const result= await cursor.toArray()
      res.send(result)
    })


    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
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
