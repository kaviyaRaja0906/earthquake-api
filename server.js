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

    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      properties: {
        id: uuidv4(),
        DateTime: new Date(entry.DateTime),
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

    const batch = db.batch();
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

    console.log('New earthquakes added to the database:', features.length);

  } catch (error) {
    console.error('Error fetching or storing earthquakes:', error);
  }
}

fetchAndStoreEarthquakeData();

const dataFetchInterval = 30 * 60 * 1000; 
setInterval(fetchAndStoreEarthquakeData, dataFetchInterval);

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
