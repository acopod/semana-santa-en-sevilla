const dayColors = [
  'match',
  ['get', 'icon'],
  'Palm Sunday', '#FF0000', // Red
  'Monday', '#FFA500', // Orange
  'Tuesday', '#FFFF00', // Yellow
  'Wednesday', '#008000', // Green
  'Thursday', '#0000FF', // Blue
  'Friday', '#4B0082', // Indigo
  'Saturday', '#EE82EE', // Violet
  'Sunday', '#800080', // Purple
  '#007cbf' // Default color if none of the above match
];


// Global variable to store pre-calculated positions (initialize elsewhere)
const precalculatedPositions = {};
const TIME_INTERVAL = 5; // Precalculate positions every 5 minutes

// Initialize the map
const map = new maplibregl.Map({
    container: 'map',
    attributionControl: false,
    zoom: 13,
    minZoom: 4,
    center: [-5.98194, 37.38955],
    style: 'https://api.maptiler.com/maps/30a250ad-fcad-4d77-884e-732b508525f7/style.json?key=HNi5BjBnVWZQP32PQRdv',
});

// Function to convert time (H:M) to minutes since 6:00
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;
  if (totalMinutes < 360) { // 360 minutes is 6:00 AM
    totalMinutes += 1440; // Add 24 hours in minutes to times past midnight
  }
  return totalMinutes - 360; // Subtract 6:00 AM in minutes
}

// Function to format minutes to HH:MM format considering starting at 6:00
function minutesToTime(minutes) {
  minutes += 360; // Add 6 hours in minutes to the time
  const hours = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}

const activeDays = {};

// Load the GeoJSON data and initialize the line layers
map.on('load', () => {
  fetch('https://api.maptiler.com/data/6b82ae0e-db26-4bd0-a66e-9de0b1f135bf/features.json?key=HNi5BjBnVWZQP32PQRdv')
    .then(response => response.json())
    .then(data => {
      data.features.forEach((feature, index) => {
        feature.id = index; // Assign a unique id to each feature
        feature.properties.visible = true; // Initialize visibility state
      });

      map.addSource('lines', {
        type: 'geojson',
        data: data
      });

      map.addLayer({
        id: 'line-layer',
        type: 'line',
        source: 'lines',
        paint: {
          'line-color': dayColors,
          'line-width': 2,
          'line-opacity': ['case', ['boolean', ['feature-state', 'visible'], false], 1, 0]
        }
      });

      // Initialize sources and layers for moving points
      data.features.forEach((feature, index) => {
        map.addSource(`moving-point-${index}`, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.addLayer({
          id: `point-layer-${index}`,
          type: 'circle',
          source: `moving-point-${index}`,
          paint: {
            'circle-radius': 5,
            'circle-color': '#FF0000'
          }
        });

        // Add a point source and layer for the second moving point
        map.addSource(`moving-point-2-${index}`, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.addLayer({
          id: `point-layer-2-${index}`,
          type: 'circle',
          source: `moving-point-2-${index}`,
          paint: {
            'circle-radius': 5,
            'circle-color': '#0000FF'
          }
        });
      });

      // Initialize the hour label
      const slider = document.getElementById('slider');
      const initialTime = slider.value;
      document.getElementById('hour-label').textContent = `Time: ${minutesToTime(initialTime)}`;

      // Add event listener to the slider
      slider.addEventListener('input', (event) => {
        const currentTime = parseInt(event.target.value);
        document.getElementById('hour-label').textContent = `Time: ${minutesToTime(currentTime)}`;
        updateLineVisibility(currentTime, data);
        updatePointPositions(currentTime, data);
      });

      // Add event listeners to buttons for filtering
      const daysOfWeek = ['Palm Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      daysOfWeek.forEach(day => {
        document.getElementById(`${day.toLowerCase().replace(/ /g, '-')}-button`).addEventListener('click', () => {
          activeDays[day] = !activeDays[day];
          updateLineVisibility(parseInt(slider.value), data);
          updatePointPositions(parseInt(slider.value), data);
        });
      });

      // Initial visibility update
      updateLineVisibility(parseInt(initialTime), data);
      updatePointPositions(parseInt(initialTime), data);
    });
});

// Function to update line visibility based on slider value and active days
function updateLineVisibility(currentTime, data) {
  data.features.forEach(feature => {
    const begin = timeToMinutes(feature.properties.begin);
    const end = timeToMinutes(feature.properties.end);
    const day = feature.properties.icon;
    const timeVisible = (currentTime >= begin && currentTime <= end) || (end < begin && (currentTime >= begin || currentTime <= end));
    const dayVisible = activeDays[day];

    const visible = timeVisible && dayVisible;
    map.setFeatureState({ source: 'lines', id: feature.id }, { visible });
  });
}

// Function to interpolate position along a polyline
function interpolatePosition(coords, t) {
  let totalLength = 0;
  const segmentLengths = [];

  // Calculate total length and segment lengths
  for (let i = 0; i < coords.length - 1; i++) {
    const length = turf.length(turf.lineString([coords[i], coords[i + 1]]));
    segmentLengths.push(length);
    totalLength += length;
  }

  // Find the segment where the interpolated point is located
  let distance = t * totalLength;
  for (let i = 0; i < segmentLengths.length; i++) {
    if (distance <= segmentLengths[i]) {
      const start = coords[i];
      const end = coords[i + 1];
      const segmentFraction = distance / segmentLengths[i];
      const interpolatedCoord = [
        start[0] + segmentFraction * (end[0] - start[0]),
        start[1] + segmentFraction * (end[1] - start[1])
      ];
      return interpolatedCoord;
    }
    distance -= segmentLengths[i];
  }

  return coords[coords.length - 1]; // In case of rounding errors, return the last coordinate
}

// Function to update point positions based on slider value and active days

function updatePointPositions(currentTime, data) {
    data.features.forEach((feature, index) => {
        const begin = timeToMinutes(feature.properties.begin);
        const end = timeToMinutes(feature.properties.end);
        const P_begin = timeToMinutes(feature.properties.P_begin);
        const P_end = timeToMinutes(feature.properties.P_end);
        const day = feature.properties.icon;

        const timeVisible = (currentTime >= begin && currentTime <= end) || 
                            (end < begin && (currentTime >= begin || currentTime <= end));
        const P_timeVisible = (currentTime >= P_begin && currentTime <= P_end) ||
                             (P_end < P_begin && (currentTime >= P_begin || currentTime <= P_end));
        const dayVisible = activeDays[day];

        let point1 = null;
        let point2 = null;

        if (timeVisible && dayVisible) {
            // Calculate the index of the closest pre-calculated point
            const tIndex = Math.round((currentTime - begin) / TIME_INTERVAL);
            point1 = precalculatedPositions[index][tIndex];
        }

        if (P_timeVisible && dayVisible) {
            // Same for the second point
            const tIndex = Math.round((currentTime - P_begin) / TIME_INTERVAL);
            point2 = precalculatedPositions[index][tIndex];
        }

        // Check if point positions have changed significantly
        const threshold = 0.0001; // Adjust based on your precision needs
        const updatePoint1 = !point1 || turf.distance(point1, map.getSource(`moving-point-${index}`)._data.features[0]?.geometry.coordinates || [0, 0]) > threshold;
        const updatePoint2 = !point2 || turf.distance(point2, map.getSource(`moving-point-2-${index}`)._data.features[0]?.geometry.coordinates || [0, 0]) > threshold;
    
        if (updatePoint1) {
            const movingPointData = {
                type: 'FeatureCollection',
                features: point1 ? [{
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: point1
                    }
                }] : []
            };
            map.getSource(`moving-point-${index}`).setData(movingPointData);
        }
    
        if (updatePoint2) {
            const movingPointData2 = {
                type: 'FeatureCollection',
                features: point2 ? [{
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: point2
                    }
                }] : []
            };
            map.getSource(`moving-point-2-${index}`).setData(movingPointData2);
        }
    });
}


// Get all toggle buttons
const toggleButtons = document.querySelectorAll('.ui.button.toggle');

// Add click event listener to each button
toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
// Toggle the 'active' class
button.classList.toggle('active');
});
});
