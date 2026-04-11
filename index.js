const express = require('express')
const cors = require('cors')
const app = express()

require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const dns = require("dns");
//Change DNS
dns.setServers([
  '1.1.1.1',
  '8.8.8.8'
])

const port = process.env.PORT || 3000

const admin = require("firebase-admin");
const serviceAccount = require("./loan-link-auth-firebase-adminsdk.json");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// middleware
app.use(express.json())
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  console.log('headers in the middleware', req.headers.authorization);
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  try {
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken)
    console.log('decoded in the token', decoded);
    req.user = decoded;
    next()
  } catch (error) {
    return res.status(401).send({ message: 'unauthorize access' })
  }

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@am.7mxwxuq.mongodb.net/?appName=AM`;
// const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-5skoi0e-shard-00-00.7mxwxuq.mongodb.net:27017,ac-5skoi0e-shard-00-01.7mxwxuq.mongodb.net:27017,ac-5skoi0e-shard-00-02.7mxwxuq.mongodb.net:27017/?ssl=true&replicaSet=atlas-lwnvca-shard-0&authSource=admin&appName=AM`;

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

    // Admin related middleware

    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email };
      const user = await usersCollection.findOne(query)

      if (!user || user.role != 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }


    // user api 

    app.post('/users', async (req, res) => {
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

    app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray()
      res.send(result)
    })

    app.get('/users/:email', verifyFBToken, async (req, res) => {
      const email = req.params.email
      if (req.user.email !== email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const user = await usersCollection.findOne({ email })
      res.send(user)
    })

    app.patch('/users/role/:id', verifyFBToken, async (req, res) => {
      const reqUser = await usersCollection.findOne({
        email: req.user.email
      })
      if (!reqUser || reqUser.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const id = req.params.id
      const { status, suspendReason, role } = req.body

      const targetUser = await usersCollection.findOne({
        _id: new ObjectId(id)
      })


      if (targetUser.email === req.user.email) {
        return res.status(400).send({
          message: 'You cannot modify your own account'
        });
      }


      const updateDoc = {
        $set: {
          role,
          status,
          suspendReason: status === 'Suspended' ? suspendReason : '',
        }
      }
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );

      res.send(result)
    })


    app.post('/loans', verifyFBToken, verifyAdmin, async (req, res) => {
      const loan = req.body
      const newLoan = {
        ...loan,
        createdBy: {
          email: req.user.email,
          name: req.user.name
        },
        createdAt: new Date(),
      }
      const result = await loansCollection.insertOne(newLoan)
      res.send(result)
    })


    app.get('/loans', verifyFBToken, async (req, res) => {

      const cursor = loansCollection.find()
      const result = await cursor.toArray();
      res.send(result)
    })

    app.get('/loans/:id', async (req, res) => {

      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await loansCollection.findOne(query)
      res.send(result)
    })

    app.patch('/loans/show/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { showOnHome } = req.body;

      const result = await loansCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { showOnHome } }
      );
      res.send(result)
    });

    app.patch('/loans/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { title,
          description,
          shortDescription,
          category,
          interestRate,
          maxLoanLimit,
          emiPlans,
          image } = req.body;

        const updateDoc = {
          $set: {
            title,
            description,
            shortDescription,
            category,
            interestRate,
            maxLoanLimit,
            emiPlans,
            image,
            updatedAt: new Date()
          }
        }
        const result = await loansCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Fail to update loan' });
      }
    });

    app.delete('/loans/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      const result = await loansCollection.deleteOne(
        { _id: new ObjectId(id) }
      );
      res.send(result)
    })

    app.get('/featured-loans', async (req, res) => {
      const cursor = loansCollection.find({ showOnHome: true }).sort({ createdAt: -1 }).limit(6)
      const result = await cursor.toArray();
      res.send(result)

    })

    app.post('/loan-application', verifyFBToken, async (req, res) => {
      if (req.user.email !== req.body.email) {
        return res.status(401).send({ message: 'forbidden access' })
      }
      const { email, loanId } = req.body;

      const existingApplication = await loanApplicationCollection.findOne({
        email: email,
        loanId: loanId,
        status: {
          $in: ["pending", "approved"]
        }
      });
      if (existingApplication) {
        return res.status(400).send({ message: 'You have already applied for the loan' });
      }

      const apply = {
        ...req.body,
        status: "pending",
        appliedAt: new Date()
      };
      const result = await loanApplicationCollection.insertOne(apply)
      res.send(result)
    });

    app.get('/loan-application/check', verifyFBToken, async (req, res) => {
      const { email, loanId } = req.query;

      if (req.user.email !== email) {
        return res.status(403).send({ message: 'forbidden access' });
      };

      const application = await loanApplicationCollection.findOne({
        email: email,
        loanId: loanId
      });
      res.send({ applied: !!application });
    });

    app.get('/loanApplication', verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const application = await loanApplicationCollection.aggregate([
          {
            $addFields: {
              loanId: { $toObjectId: "$loanId" },

            }
          },
          {
            $lookup: {
              from: "loans",
              localField: "loanId",
              foreignField: "_id",
              as: "loanInfo"
            }
          },
          {
            $unwind: "$loanInfo"
          },
          {
            $project: {
              loanId: 1,
              title: "$loanInfo.title",
              email: 1,
              interestRate: 1,
              firstName: 1,
              lastName: 1,
              contactNumber: 1,
              address: 1,
              npNumber: 1,
              incomeSource: 1,
              monthlyIncome: 1,
              loanReason: 1,
              exNotes: 1,
              status: 1,
              applicationFeeStatus: 1,
              image: "$loanInfo.image",
              amount: "$loanAmount",
              category: "$loanInfo.category",
              approvedAt: 1
            }
          }
        ]).toArray()
        res.send(application)
      } catch (error) {
        res.status(500).send({ message: "Fail to fetch loan application " })
      }
    })

    app.get('/loanApply', verifyFBToken, async (req, res) => {
      const cursor = loanApplicationCollection.find({ status: 'pending' })
      const result = await cursor.toArray();
      res.send(result)
    })

    app.get('/loanApply/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await loanApplicationCollection.findOne({
          _id: new ObjectId(id)
        });

        if (!result) {
          return res.status(404).send({ message: 'Loan application not found' })
        }
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Fail to get loan application' })
      }
    })

    app.patch('/loanApply/status/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const existing = await loanApplicationCollection.findOne({
          _id: new ObjectId(id)
        })
        if (!existing) {
          return res.status(404).send({ message: 'Loan not found' })
        }
        if (existing.status === status) {
          return res.send({ message: 'Already in this status' })
        }

        const updateDoc = {
          $set: {
            status: status,
            ...(status === 'approved' && { approvedAt: new Date() }),
            ...(status !== 'approved' && {
              $unset: { approvedAt: "" }
            })
          }
        };
        const result = await loanApplicationCollection.updateOne({
          _id: new ObjectId(id)
        },
          updateDoc
        );
        res.send(result)

      } catch (error) {
        res.status(500).send({ message: 'Fail to update status' });
      }
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
