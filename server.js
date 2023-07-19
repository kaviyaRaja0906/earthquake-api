// server.js (or index.js, depending on your setup)
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const earthquakesCollection = db.collection('earthquakedatas');

app.use(express.json());
app.use(cors());
const corsOptions = {
  origin: ["https://earthquake-e3pd.onrender.com"],
};

const requestEndpoint = 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json';

function convertToGeoJSON(data) {
  const features = data.Infogempa.gempa.map((entry) => {
    const coordinates = entry.Coordinates.split(',');
    const longitude = parseFloat(coordinates[1]);
    const latitude = parseFloat(coordinates[0]);

    if (isNaN(longitude) || isNaN(latitude)) {
      throw new Error('Invalid longitude or latitude');
    }
    const earthquakeDate = new Date(entry.DateTime);
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      properties: {
        id: uuidv4(),
        DateTime: earthquakeDate.toISOString(),
        Date: earthquakeDate,
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


async function fetchAndStoreEarthquakeData() {
  try {
    const fetchOptions = {
      method: 'GET',
    };
    const response = await fetch(requestEndpoint, fetchOptions);
    const data = await response.json();

    const geojson = convertToGeoJSON(data);
    const { features } = geojson;

    for (const feature of features) {
      const earthquakeDateTime = feature.properties.DateTime;

      const snapshot = await earthquakesCollection.where('properties.DateTime', '==', earthquakeDateTime).get();
      if (snapshot.empty) {
        const docRef = earthquakesCollection.doc();
        await docRef.set(feature);
      }
    }

    console.log('New earthquakes added to the database:', features.length);
  } catch (error) {
    console.error('Error fetching or storing earthquakes:', error);
  }
}

fetchAndStoreEarthquakeData();

app.get('/earthquakes', cors(corsOptions), async (req, res) => {
  try {
    await fetchAndStoreEarthquakeData();

    const snapshot = await earthquakesCollection.get();
    const earthquakes = [];

    snapshot.forEach((doc) => {
      const earthquake = doc.data();
      earthquakes.push(earthquake);
    });

    res.json(earthquakes);
  } catch (error) {
    console.error('Error fetching earthquakes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
