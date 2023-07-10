const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT ||5000;
const app = express();

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const earthquakesCollection = db.collection('earthquakes');

app.use(express.json());
app.use(cors());
const corsOptions = {
  origin: ["https://earthquake-e3pd.onrender.com"],
};

const requestEndpoint = 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json';

app.get('/getData', cors(corsOptions), async (req, res) => {
  try {
    const fetchOptions = {
      method: 'GET',
    };
    const response = await fetch(requestEndpoint, fetchOptions);
    const data = await response.json();

    function convertToGeoJSON(data) {
      const features = data.Infogempa.gempa.map((entry) => {
        const coordinates = entry.Coordinates.split(',');
        const longitude = parseFloat(coordinates[1]);
        const latitude = parseFloat(coordinates[0]);

        if (isNaN(longitude) || isNaN(latitude)) {
          throw new Error('Invalid longitude or latitude');
        }

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          properties: {
            id: uuidv4(),
            dateTime: new Date(entry.DateTime),
            region: entry.Wilayah,
            magnitude: parseFloat(entry.Magnitude),
            depth: parseInt(entry.Kedalaman.match(/\d+/)[0]),
            latitude: latitude,
            longitude: longitude,
          },
        };
      });

      return {
        type: 'FeatureCollection',
        features,
      };
    }

    const geojson = convertToGeoJSON(data);
    res.json(geojson);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/storeData', async (req, res) => {
  try {
    const { features } = req.body;
    const batch = db.batch();
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error('Invalid features array');
    }
    features.forEach((feature) => {
      const uniqueId = uuidv4();
      const docRef = earthquakesCollection.doc(uniqueId);
      const featureWithId = {
        ...feature,
        properties: {
          ...feature.properties,
          id: uniqueId,
        },
      };
      batch.set(docRef, featureWithId);
    });

    await batch.commit();
    res.sendStatus(200);
  } catch (error) {
    console.error('Error storing data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
  app.get('/earthquakes', async (req, res) => {
    try {
      const snapshot = await earthquakesCollection.get();
      const earthquakes = [];
  
      snapshot.forEach((doc) => {
        earthquakes.push(doc.data());
      });
  
      res.json(earthquakes);
    } catch (error) {
      console.error('Error fetching earthquakes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
});
