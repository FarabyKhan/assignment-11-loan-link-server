const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.port||3000

// middleware
app.use(express.json())
app.use(cors());

 const verifyFBToken = (req, res, next) =>{
  console.log('headers in the middleware', req.headers.authorization);
  next()
 }

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@am.7mxwxuq.mongodb.net/?appName=AM`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("loan_link_db")
    const usersCollection = db.collection('users');
    const loansCollection = db.collection('loans');
    const loanApplicationCollection = db.collection('loanApply');

    // user api 
  app.post('/users', async(req,res)=>{
    const user = req.body
   const role = user.role
    const email = user.email
     const userExist = await usersCollection.findOne({ email })

      if (userExist) {
        return res.send({ message: 'user exists' })
      }

    const result = await usersCollection.insertOne(user)
    res.send(result)
  })

  app.get('/users/:email', async(req,res)=>{
      const email = req.params.email
      const user = await usersCollection.findOne({email})
      res.send(user)
  })


  app.post('/loans', async(req,res)=>{
    const loan = req.body
    const result = await loansCollection.insertOne(loan)
    res.send(result)
  })


  app.get('/loans', async(req, res)=>{
    const cursor =loansCollection.find()
    const result = await cursor.toArray();
    res.send(result) 
  })

  app.get('/loans/:id', verifyFBToken, async(req, res)=>{
    const id = req.params.id;
    const query = { _id: new ObjectId(id) }
    const result = await loansCollection.findOne(query)
    res.send(result)
  })

  app.get('/featured-loans',async(req,res)=>{
    const cursor = loansCollection.find().sort({ createdAt:-1 }).limit(6)
    const result = await cursor.toArray();
    res.send(result)

  })

  app.post('/loan-application',async(req,res)=>{
    const apply = req.body
    const result = await loanApplicationCollection.insertOne(apply)
    res.send(result)
  })

  app.get('/loan-application',async(req,res)=>{
    const cursor = loanApplicationCollection.find()
    const result = await cursor.toArray();
    res.send(result)
  })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server is running')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
