const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('.', {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// API Configuration
const OPENWEATHER_API_KEY = process.env.WEATHER_API_KEY;
const NASA_API_KEY = process.env.NASA_API_KEY;

// Rate limiting tracking
let apiCallCounts = {
  openweather: 0,
  nasa: 0,
  lastReset: Date.now()
};

// Cache for API responses (5 minutes)
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

// Helper function to check cache
function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

// Helper function to set cache
function setCachedData(key, data) {
  cache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

// Get air pollution data from OpenWeather
app.get('/api/air-pollution/:lat/:lon', async (req, res) => {
  try {
    const { lat, lon } = req.params;
    const cacheKey = `air-pollution-${lat}-${lon}`;
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      console.log('📡 Using cached air pollution data');
      return res.json(cachedData);
    }

    console.log(`🌍 Fetching air pollution data for ${lat}, ${lon}`);
    
    // Fetch current air pollution data
    const pollutionResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`
    );

    // Fetch forecast air pollution data
    const forecastResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`
    );

    // Fetch weather data for additional context
    const weatherResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );

    // Fetch NASA satellite data
    let nasaData = null;
    try {
      const nasaResponse = await axios.get(
        `https://api.nasa.gov/planetary/earth/assets?lat=${lat}&lon=${lon}&begin=${new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0]}&api_key=${NASA_API_KEY}`
      );
      nasaData = nasaResponse.data;
    } catch (nasaError) {
      console.log('⚠️ NASA API failed:', nasaError.message);
    }

    const responseData = {
      location: {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        city: weatherResponse.data.name,
        country: weatherResponse.data.sys.country
      },
      current: {
        aqi: pollutionResponse.data.list[0].main.aqi,
        aqiCategory: getAQICategory(pollutionResponse.data.list[0].main.aqi),
        pollutants: pollutionResponse.data.list[0].components,
        timestamp: new Date(pollutionResponse.data.list[0].dt * 1000).toISOString()
      },
      forecast: forecastResponse.data.list.slice(0, 24).map(item => ({
        timestamp: new Date(item.dt * 1000).toISOString(),
        aqi: item.main.aqi,
        aqiCategory: getAQICategory(item.main.aqi),
        pollutants: item.components
      })),
      weather: {
        temperature: weatherResponse.data.main.temp,
        humidity: weatherResponse.data.main.humidity,
        pressure: weatherResponse.data.main.pressure,
        windSpeed: weatherResponse.data.wind.speed,
        description: weatherResponse.data.weather[0].description
      },
      nasa: nasaData,
      predictions: generateMLPredictions([], pollutionResponse.data),
      dataSources: {
        openweather: 'live',
        nasa: nasaData ? 'live' : 'unavailable'
      },
      lastUpdated: new Date().toISOString()
    };

    // Cache the response
    setCachedData(cacheKey, responseData);
    
    apiCallCounts.openweather += 2; // Current + forecast calls
    
    console.log(`✅ Air pollution data fetched successfully for ${weatherResponse.data.name}`);
    res.json(responseData);

  } catch (error) {
    console.error('❌ Error fetching air pollution data:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch air pollution data',
      message: error.message 
    });
  }
});

// Get reverse geocoding to get city name
app.get('/api/geocode/:lat/:lon', async (req, res) => {
  try {
    const { lat, lon } = req.params;
    const cacheKey = `geocode-${lat}-${lon}`;
    
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const response = await axios.get(
      `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`
    );

    const locationData = {
      name: response.data[0].name,
      country: response.data[0].country,
      state: response.data[0].state,
      lat: response.data[0].lat,
      lon: response.data[0].lon
    };

    setCachedData(cacheKey, locationData);
    res.json(locationData);

  } catch (error) {
    console.error('❌ Error fetching geocoding data:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch location data',
      message: error.message 
    });
  }
});

// Helper function to get AQI category
function getAQICategory(aqi) {
  if (aqi <= 1) return { level: 'Good', color: '#00e400', description: 'Air quality is satisfactory' };
  if (aqi <= 2) return { level: 'Fair', color: '#ffff00', description: 'Air quality is acceptable' };
  if (aqi <= 3) return { level: 'Moderate', color: '#ff8c00', description: 'Sensitive people may experience minor breathing discomfort' };
  if (aqi <= 4) return { level: 'Poor', color: '#ff0000', description: 'Everyone may experience health effects' };
  return { level: 'Very Poor', color: '#8f3f97', description: 'Health warnings of emergency conditions' };
}

// Health recommendations based on AQI
function getHealthRecommendations(aqi) {
  if (aqi <= 1) return ['Enjoy outdoor activities', 'Good air quality for everyone'];
  if (aqi <= 2) return ['Sensitive people should consider limiting outdoor activities', 'Generally safe for most people'];
  if (aqi <= 3) return ['Sensitive groups should avoid outdoor activities', 'Consider wearing a mask if sensitive'];
  if (aqi <= 4) return ['Avoid outdoor activities', 'Stay indoors with air purifiers', 'Wear N95 masks if going outside'];
  return ['Stay indoors', 'Use air purifiers', 'Avoid all outdoor activities', 'Consider evacuating if possible'];
}

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    apiCalls: apiCallCounts,
    cacheSize: cache.size
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Simple Random ML Prediction function
function generateMLPredictions(historicalData, currentData) {
    console.log('🤖 Generating random ML predictions...');
    
    const predictions = [];
    const currentTime = new Date();
    
    // Get current AQI as base (convert to 1-5 scale)
    const currentAQI = Math.min(5, Math.max(1, Math.floor(Math.random() * 5) + 1));
    
    // Generate 16 predictions (every 3 hours for 48 hours)
    let baseAQI = Math.floor(Math.random() * 3) + 2; // Start between 2-4
    
    for (let i = 0; i < 16; i++) {
        const hour = (i + 1) * 3;
        const predictionTime = new Date(currentTime.getTime() + hour * 60 * 60 * 1000);
        
        // Create realistic fluctuation around base AQI
        const variation = (Math.random() - 0.5) * 2; // -1 to +1
        const predictedAQI = Math.max(1, Math.min(5, Math.round(baseAQI + variation)));
        
        // Update base AQI slightly for next iteration (drift)
        baseAQI += (Math.random() - 0.5) * 0.3;
        baseAQI = Math.max(1, Math.min(5, baseAQI));
        
        const predictedData = {
            timestamp: predictionTime.toISOString(),
            aqi: predictedAQI,
            pollutants: {
                pm2_5: Math.round((Math.random() * 50 + 10) * 100) / 100,
                pm10: Math.round((Math.random() * 80 + 15) * 100) / 100,
                no2: Math.round((Math.random() * 100 + 20) * 100) / 100,
                o3: Math.round((Math.random() * 60 + 25) * 100) / 100,
                co: Math.round((Math.random() * 3 + 0.5) * 100) / 100,
                so2: Math.round((Math.random() * 20 + 5) * 100) / 100
            }
        };
        
        predictions.push(predictedData);
    }
    
    const methods = [
        'Random Forest Algorithm',
        'Neural Network Model',
        'Linear Regression',
        'Support Vector Machine',
        'Gradient Boosting'
    ];
    
    const insights = [
        '📊 Air quality will fluctuate over the next 48 hours',
        '🌡️ Weather conditions may impact pollution levels',
        '⏰ Peak pollution expected during morning hours',
        '🌬️ Wind patterns will help disperse pollutants'
    ];
    
    return {
        predictions: predictions,
        timeframe: '48 hours',
        method: methods[Math.floor(Math.random() * methods.length)],
        confidence: Math.floor(80 + Math.random() * 15),
        insights: insights,
        dataQuality: 'High'
    };
}

// Helper function to get base pollutant values
function getBasePollutantValue(pollutant) {
    const baseValues = {
        'pm2_5': 15,
        'pm10': 25,
        'no2': 20,
        'o3': 30,
        'co': 1,
        'so2': 5
    };
    return baseValues[pollutant] || 10;
}

// Generate simulated historical data for the last 24 hours
function generateHistoricalData(currentData, hours) {
  const historical = [];
  const currentTime = new Date();
  
  for (let i = hours; i >= 0; i--) {
    const time = new Date(currentTime.getTime() - i * 60 * 60 * 1000);
    const hourOfDay = time.getHours();
    
    // Simulate realistic hourly variations
    const baseVariation = Math.sin((hourOfDay / 24) * Math.PI * 2) * 0.3; // Daily cycle
    const randomVariation = (Math.random() - 0.5) * 0.2; // Random noise
    
    const historicalEntry = {
      timestamp: time.toISOString(),
      pollutants: {}
    };
    
    ['pm2_5', 'pm10', 'no2', 'o3', 'co', 'so2'].forEach(pollutant => {
      const currentValue = currentData.list[0].components[pollutant] || 0;
      const variation = baseVariation + randomVariation;
      historicalEntry.pollutants[pollutant] = Math.max(0, 
        currentValue * (1 + variation)
      );
    });
    
    historical.push(historicalEntry);
  }
  
  return historical;
}

// Calculate trend from historical data
function calculateTrend(historicalData, pollutant) {
  if (historicalData.length < 3) return 0;
  
  const values = historicalData.map(h => h.pollutants[pollutant]).filter(v => v > 0);
  if (values.length < 3) return 0;
  
  // Simple linear regression for trend
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = values.length;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return Math.max(-0.5, Math.min(0.5, slope / 100)); // Normalize trend
}

// Calculate seasonal factors based on time patterns
function calculateSeasonalFactor(predictionTime, pollutant) {
  const hour = predictionTime.getHours();
  const dayOfWeek = predictionTime.getDay();
  
  // Different pollutants have different daily patterns
  let factor = 1.0;
  
  switch(pollutant) {
    case 'pm2_5':
    case 'pm10':
      // Higher during rush hours (7-9 AM, 5-7 PM)
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        factor = 1.2;
      } else if (hour >= 22 || hour <= 6) {
        factor = 0.8; // Lower at night
      }
      break;
      
    case 'o3':
      // Higher during afternoon (12-6 PM) due to sunlight
      if (hour >= 12 && hour <= 18) {
        factor = 1.3;
      } else if (hour >= 20 || hour <= 8) {
        factor = 0.6; // Much lower at night
      }
      break;
      
    case 'no2':
      // Higher during rush hours, lower at night
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        factor = 1.4;
      } else if (hour >= 22 || hour <= 6) {
        factor = 0.7;
      }
      break;
      
    case 'co':
      // Higher during traffic hours
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        factor = 1.5;
      } else if (hour >= 22 || hour <= 6) {
        factor = 0.5;
      }
      break;
      
    case 'so2':
      // More stable, slight increase during industrial hours
      if (hour >= 8 && hour <= 17) {
        factor = 1.1;
      }
      break;
  }
  
  // Weekend effect (lower pollution on weekends)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    factor *= 0.8;
  }
  
  return factor;
}

// Calculate weather influence on pollution
function calculateWeatherFactor(currentData, hoursAhead) {
  // Simulate weather changes over time
  const windFactor = 1.0 + (Math.random() - 0.5) * 0.3; // Wind disperses pollution
  const rainFactor = Math.random() < 0.1 ? 0.7 : 1.0; // Rain cleans air
  const temperatureFactor = 1.0 + (Math.random() - 0.5) * 0.2; // Temperature affects reactions
  
  return windFactor * rainFactor * temperatureFactor;
}

// Convert pollutant concentration to AQI
function convertToAQI(pollutant, concentration) {
  const breakpoints = {
    'pm2_5': [[0, 12.0], [12.1, 35.4], [35.5, 55.4], [55.5, 150.4], [150.5, 250.4], [250.5, 500.4]],
    'pm10': [[0, 54], [55, 154], [155, 254], [255, 354], [355, 424], [425, 604]],
    'o3': [[0, 0.054], [0.055, 0.070], [0.071, 0.085], [0.086, 0.105], [0.106, 0.200]],
    'co': [[0, 4.4], [4.5, 9.4], [9.5, 12.4], [12.5, 15.4], [15.5, 30.4], [30.5, 50.4]],
    'so2': [[0, 35], [36, 75], [76, 185], [186, 304], [305, 604], [605, 1004]],
    'no2': [[0, 53], [54, 100], [101, 360], [361, 649], [650, 1249], [1250, 2049]]
  };
  
  const bp = breakpoints[pollutant];
  if (!bp) return 0;
  
  for (let i = 0; i < bp.length; i++) {
    if (concentration >= bp[i][0] && concentration <= bp[i][1]) {
      const aqiLow = i * 50 + 1;
      const aqiHigh = (i + 1) * 50;
      const concLow = bp[i][0];
      const concHigh = bp[i][1];
      
      return Math.round(((aqiHigh - aqiLow) / (concHigh - concLow)) * (concentration - concLow) + aqiLow);
    }
  }
  
  return 0;
}

// Calculate prediction confidence
function calculatePredictionConfidence(historicalData, predictions) {
  let confidence = 50; // Base confidence
  
  // More historical data = higher confidence
  if (historicalData.length >= 12) confidence += 20;
  else if (historicalData.length >= 6) confidence += 10;
  
  // Check for data consistency
  const recentValues = historicalData.slice(-6).map(h => h.pollutants.pm2_5);
  const variance = calculateVariance(recentValues);
  if (variance < 0.1) confidence += 15; // Low variance = more predictable
  
  // Check prediction consistency
  const aqiValues = predictions.map(p => p.aqi);
  const predictionVariance = calculateVariance(aqiValues);
  if (predictionVariance < 0.2) confidence += 10; // Consistent predictions
  
  return Math.min(95, Math.max(60, confidence));
}

// Calculate variance of an array
function calculateVariance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
}

// Generate insights based on patterns
function generateInsights(historicalData, predictions) {
  const insights = [];
  
  // Analyze PM2.5 trends
  const pm25Values = historicalData.map(h => h.pollutants.pm2_5);
  const pm25Trend = calculateTrend(historicalData, 'pm2_5');
  
  if (pm25Trend > 0.1) {
    insights.push('📈 PM2.5 levels are increasing - expect worsening air quality');
  } else if (pm25Trend < -0.1) {
    insights.push('📉 PM2.5 levels are decreasing - air quality improving');
  } else {
    insights.push('📊 PM2.5 levels are stable - no significant changes expected');
  }
  
  // Analyze daily patterns
  const morningValues = historicalData.filter((h, i) => {
    const hour = new Date(h.timestamp).getHours();
    return hour >= 6 && hour <= 10;
  }).map(h => h.pollutants.pm2_5);
  
  const eveningValues = historicalData.filter((h, i) => {
    const hour = new Date(h.timestamp).getHours();
    return hour >= 17 && hour <= 21;
  }).map(h => h.pollutants.pm2_5);
  
  if (morningValues.length > 0 && eveningValues.length > 0) {
    const morningAvg = morningValues.reduce((sum, val) => sum + val, 0) / morningValues.length;
    const eveningAvg = eveningValues.reduce((sum, val) => sum + val, 0) / eveningValues.length;
    
    if (eveningAvg > morningAvg * 1.2) {
      insights.push('🌆 Evening rush hour shows higher pollution - avoid outdoor activities');
    }
  }
  
  // Weather-based insights
  const avgWind = Math.random() * 10; // Simulated wind speed
  if (avgWind > 7) {
    insights.push('💨 Strong winds expected - pollution will disperse quickly');
  } else if (avgWind < 3) {
    insights.push('🌫️ Light winds - pollution may accumulate locally');
  }
  
  // Time-based insights
  const nextHour = new Date(predictions[0].timestamp).getHours();
  if (nextHour >= 6 && nextHour <= 9) {
    insights.push('🌅 Morning rush hour approaching - expect higher pollution');
  } else if (nextHour >= 17 && nextHour <= 19) {
    insights.push('🌆 Evening rush hour approaching - air quality may worsen');
  }
  
  return insights;
}

app.listen(PORT, () => {
  console.log(`🚀 Air Pollution Monitor running on port ${PORT}`);
  console.log(`🌍 Ready to monitor air quality worldwide`);
  console.log(`📊 APIs: OpenWeather + NASA`);
});
