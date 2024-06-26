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

// Load the GeoJSON data and initialize the line layers
map.on('load', () => {
  fetch('https://api.maptiler.com/data/6b82ae0e-db26-4bd0-a66e-9de0b1f135bf/features.json?key=HNi5BjBnVWZQP32PQRdv')
    .then(response => response.json())
    .then(data => {
      data.features.forEach((feature, index) => {
        feature.id = index; // Assign a unique id to each feature
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
          'line-color': '#007cbf',
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

        // // Add source and layer for connecting line
        // map.addSource(`connecting-line-${index}`, {
        //   type: 'geojson',
        //   data: {
        //     type: 'FeatureCollection',
        //     features: [{
        //       type: 'Feature',
        //       geometry: {
        //         type: 'LineString',
        //         coordinates: [] 
        //       }
        //     }]
        //   }
        // });

        // map.addLayer({
        //   id: `connecting-line-layer-${index}`,
        //   type: 'line',
        //   source: `connecting-line-${index}`,
        //   paint: {
        //     'line-color': '#FF00FF', 
        //     'line-width': 2
        //   }
        // });
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

      // Initial visibility update
      updateLineVisibility(parseInt(initialTime), data);
      updatePointPositions(parseInt(initialTime), data);
    });
});


// Function to update line visibility based on slider value
function updateLineVisibility(currentTime, data) {
  data.features.forEach(feature => {
    const begin = timeToMinutes(feature.properties.begin);
    const end = timeToMinutes(feature.properties.end);
    const visible = (currentTime >= begin && currentTime <= end) ||
                    (end < begin && (currentTime >= begin || currentTime <= end));
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

// Function to update point positions based on slider value
function updatePointPositions(currentTime, data) {
  data.features.forEach((feature, index) => {
    let point1, point2;

    const begin = timeToMinutes(feature.properties.begin);
    const end = timeToMinutes(feature.properties.end);
    const P_begin = timeToMinutes(feature.properties.P_begin);
    const P_end = timeToMinutes(feature.properties.P_end);

    if ((currentTime >= begin && currentTime <= end) || (end < begin && (currentTime >= begin || currentTime <= end))) {
      const coords = feature.geometry.coordinates;
      const t = (currentTime >= begin ? currentTime - begin : currentTime + 1440 - begin) / (end >= begin ? end - begin : end + 1440 - begin);
      point1 = interpolatePosition(coords, t);
      const movingPointData = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: point1
          }
        }]
      };
      map.getSource(`moving-point-${index}`).setData(movingPointData);
    }

    if ((currentTime >= P_begin && currentTime <= P_end) || (P_end < P_begin && (currentTime >= P_begin || currentTime <= P_end))) {
      const coords = feature.geometry.coordinates;
      const t = (currentTime >= P_begin ? currentTime - P_begin : currentTime + 1440 - P_begin) / (P_end >= P_begin ? P_end - P_begin : P_end + 1440 - P_begin);
      point2 = interpolatePosition(coords, t);
      const movingPointData2 = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: point2
          }
        }]
      };
      map.getSource(`moving-point-2-${index}`).setData(movingPointData2);
    }

    // // Update the connecting line with the new positions of the points
    // if (point1 && point2) {
    //   const connectingLineData = {
    //     type: 'FeatureCollection',
    //     features: [{
    //       type: 'Feature',
    //       geometry: {
    //         type: 'LineString',
    //         coordinates: [point1, point2]
    //       }
    //     }]
    //   };
    //   map.getSource(`connecting-line-${index}`).setData(connectingLineData);
    // }

    
  });
}

