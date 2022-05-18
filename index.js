const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const verify = require('jsonwebtoken/verify');
const middlewareWrapper = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;


//middleware
app.use(cors());
app.use(express.json());

//mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5nmcj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// jwt verify function
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const usersCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');

        // verify admin middleware
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const reqesterAccount = await usersCollection.findOne({ email: requester });
            if (reqesterAccount.role === 'admin') {
                next()
            }
            else {
                return res.status(403).send({ message: `forbidden access` })
            }
        }


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const service = await cursor.toArray();
            res.send(service);
        });

        //dashboard All Users
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })
        // for admin role 
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ result, token });
        })

        // Warning: This is not the proper way to query multiple collection. 
        // After learning more about mongodb. use aggregate, lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 16, 2022';

            //step 1 : get all services
            const services = await serviceCollection.find().toArray();

            //step 2: get the booking of that day.[{}, {}, {}, {}...]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();


            // step 3: for each service, find booking for that service
            services.forEach(service => {
                // step 4: find bookings for that service.
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                // step 7 : set available to slots to make it easier
                service.slots = available;
            })
            res.send(services);

        })
        /**
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
         * app.get('/booking/:id') // get a specific booking 
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id) //
         * app.put('/booking/:id) // upsert ==> update (if exists) or insert (if doesn't exist)
         * app.delete('/booking/:id) //
        */
        app.get('/booking', verifyJWT, verifyAdmin, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const booking = await bookingCollection.find(query).toArray();
                res.send(booking);
            } else {
                return res.status(403).send({ message: `forbidden access` })
            }
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result });
        });

        //get api for doctors collection
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })
        // add doctors in database
        app.post('/doctor', verifyJWT, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })



    }
    finally {

    }
}


run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello Doctor Portal')
})

app.listen(port, () => {
    console.log(`Doctors  app listening on port ${port}`)
})