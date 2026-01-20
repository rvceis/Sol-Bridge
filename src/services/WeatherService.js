/**
 * Weather Service
 * Fetches weather data including irradiance from OpenWeather API
 */

const axios = require('axios');
const logger = require('../utils/logger');

class WeatherService {
  constructor() {
    this.apiKey = process.env.WEATHER_API_KEY;
    this.apiEndpoint = process.env.WEATHER_API_ENDPOINT || 'https://api.openweathermap.org/data/2.5';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('Weather API key not configured - weather features disabled');
    }
  }

  /**
   * Get current weather data including solar irradiance
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<Object>}
   */
  async getCurrentWeather(latitude, longitude) {
    if (!this.enabled) {
      throw new Error('Weather service not configured');
    }

    try {
      const response = await axios.get(`${this.apiEndpoint}/weather`, {
        params: {
          lat: latitude,
          lon: longitude,
          appid: this.apiKey,
          units: 'metric'
        },
        timeout: 5000
      });

      const data = response.data;

      // Calculate solar irradiance from cloud cover
      const irradiance = this.calculateIrradiance(
        data.clouds?.all || 0,
        latitude,
        data.dt
      );

      return {
        location: {
          lat: latitude,
          lon: longitude,
          name: data.name
        },
        temperature: data.main?.temp,
        feels_like: data.main?.feels_like,
        humidity: data.main?.humidity,
        pressure: data.main?.pressure,
        cloud_cover: data.clouds?.all || 0,
        wind_speed: data.wind?.speed,
        wind_direction: data.wind?.deg,
        weather: data.weather?.[0]?.main,
        weather_description: data.weather?.[0]?.description,
        visibility: data.visibility,
        sunrise: data.sys?.sunrise,
        sunset: data.sys?.sunset,
        irradiance: irradiance, // W/m²
        timestamp: data.dt,
        timezone: data.timezone
      };
    } catch (error) {
      logger.error('Failed to fetch current weather:', error.message);
      throw new Error('Weather service unavailable');
    }
  }

  /**
   * Get weather forecast (5 day / 3 hour intervals)
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<Object>}
   */
  async getForecast(latitude, longitude) {
    if (!this.enabled) {
      throw new Error('Weather service not configured');
    }

    try {
      const response = await axios.get(`${this.apiEndpoint}/forecast`, {
        params: {
          lat: latitude,
          lon: longitude,
          appid: this.apiKey,
          units: 'metric'
        },
        timeout: 5000
      });

      const data = response.data;

      // Process forecast data
      const forecasts = data.list.map(item => {
        const irradiance = this.calculateIrradiance(
          item.clouds?.all || 0,
          latitude,
          item.dt
        );

        return {
          timestamp: item.dt,
          datetime: new Date(item.dt * 1000).toISOString(),
          temperature: item.main?.temp,
          feels_like: item.main?.feels_like,
          humidity: item.main?.humidity,
          pressure: item.main?.pressure,
          cloud_cover: item.clouds?.all || 0,
          wind_speed: item.wind?.speed,
          wind_direction: item.wind?.deg,
          weather: item.weather?.[0]?.main,
          weather_description: item.weather?.[0]?.description,
          precipitation_probability: item.pop * 100, // Probability of precipitation
          rain_3h: item.rain?.['3h'] || 0,
          snow_3h: item.snow?.['3h'] || 0,
          irradiance: irradiance, // W/m²
          visibility: item.visibility
        };
      });

      return {
        location: {
          lat: latitude,
          lon: longitude,
          name: data.city?.name,
          country: data.city?.country
        },
        sunrise: data.city?.sunrise,
        sunset: data.city?.sunset,
        timezone: data.city?.timezone,
        forecasts: forecasts,
        count: forecasts.length
      };
    } catch (error) {
      logger.error('Failed to fetch weather forecast:', error.message);
      throw new Error('Weather forecast unavailable');
    }
  }

  /**
   * Get solar irradiance data for energy prediction
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} hours - Number of hours to forecast (default: 24)
   * @returns {Promise<Object>}
   */
  async getSolarForecast(latitude, longitude, hours = 24) {
    const forecast = await this.getForecast(latitude, longitude);
    
    // Filter to requested hours
    const now = Math.floor(Date.now() / 1000);
    const endTime = now + (hours * 3600);
    
    const solarData = forecast.forecasts
      .filter(f => f.timestamp <= endTime)
      .map(f => ({
        timestamp: f.timestamp,
        datetime: f.datetime,
        irradiance: f.irradiance,
        cloud_cover: f.cloud_cover,
        temperature: f.temperature,
        humidity: f.humidity,
        weather: f.weather,
        // Estimate energy potential (simplified)
        energy_potential: this.estimateEnergyPotential(f.irradiance, f.temperature)
      }));

    return {
      location: forecast.location,
      period_hours: hours,
      data_points: solarData.length,
      solar_data: solarData,
      summary: {
        avg_irradiance: this.average(solarData.map(d => d.irradiance)),
        max_irradiance: Math.max(...solarData.map(d => d.irradiance)),
        min_irradiance: Math.min(...solarData.map(d => d.irradiance)),
        avg_cloud_cover: this.average(solarData.map(d => d.cloud_cover)),
        total_energy_potential: solarData.reduce((sum, d) => sum + d.energy_potential, 0)
      }
    };
  }

  /**
   * Get weather data for multiple devices
   * @param {Array} devices - Array of {id, latitude, longitude}
   * @returns {Promise<Array>}
   */
  async getDevicesWeather(devices) {
    if (!this.enabled) {
      return devices.map(d => ({ device_id: d.id, error: 'Weather service disabled' }));
    }

    const results = await Promise.allSettled(
      devices.map(async (device) => {
        try {
          const weather = await this.getCurrentWeather(device.latitude, device.longitude);
          return {
            device_id: device.id,
            device_name: device.name,
            ...weather
          };
        } catch (error) {
          return {
            device_id: device.id,
            device_name: device.name,
            error: error.message
          };
        }
      })
    );

    return results.map(r => r.status === 'fulfilled' ? r.value : r.reason);
  }

  /**
   * Calculate solar irradiance based on cloud cover and solar angle
   * @param {number} cloudCover - Cloud cover percentage (0-100)
   * @param {number} latitude
   * @param {number} timestamp - Unix timestamp
   * @returns {number} Irradiance in W/m²
   */
  calculateIrradiance(cloudCover, latitude, timestamp) {
    // Maximum solar irradiance (clear sky at solar noon)
    const MAX_IRRADIANCE = 1000; // W/m²

    // Get solar elevation angle
    const solarAngle = this.calculateSolarAngle(latitude, timestamp);
    
    // If sun is below horizon, irradiance is 0
    if (solarAngle <= 0) {
      return 0;
    }

    // Base irradiance from solar angle (sin function for simplicity)
    const angleMultiplier = Math.sin((solarAngle * Math.PI) / 180);
    
    // Cloud cover reduction (0% clouds = 1.0, 100% clouds = 0.2)
    const cloudMultiplier = 1 - (cloudCover / 100) * 0.8;
    
    // Calculate final irradiance
    const irradiance = MAX_IRRADIANCE * angleMultiplier * cloudMultiplier;
    
    return Math.round(irradiance * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate solar elevation angle (simplified)
   * @param {number} latitude
   * @param {number} timestamp
   * @returns {number} Solar angle in degrees
   */
  calculateSolarAngle(latitude, timestamp) {
    const date = new Date(timestamp * 1000);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    
    // Solar noon is approximately at 12:00 UTC + longitude correction
    // Simplified: assume solar noon at 12:00 local time
    const hourAngle = (hour - 12) * 15; // 15 degrees per hour
    
    // Day of year
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    
    // Solar declination (simplified)
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);
    
    // Solar elevation angle
    const latRad = latitude * Math.PI / 180;
    const decRad = declination * Math.PI / 180;
    const haRad = hourAngle * Math.PI / 180;
    
    const elevation = Math.asin(
      Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
    ) * 180 / Math.PI;
    
    return Math.max(0, elevation);
  }

  /**
   * Estimate energy potential from irradiance and temperature
   * @param {number} irradiance - W/m²
   * @param {number} temperature - °C
   * @returns {number} Energy potential in kWh per m² per hour
   */
  estimateEnergyPotential(irradiance, temperature) {
    // Standard test conditions: 1000 W/m² at 25°C
    // Typical panel efficiency: 15-20%, use 17%
    const PANEL_EFFICIENCY = 0.17;
    
    // Temperature coefficient: -0.4% per °C above 25°C
    const TEMP_COEFFICIENT = -0.004;
    const tempLoss = (temperature - 25) * TEMP_COEFFICIENT;
    const effectiveEfficiency = PANEL_EFFICIENCY * (1 + tempLoss);
    
    // Energy per m² per hour (irradiance is instantaneous power)
    // For 3-hour forecast interval, multiply by 3
    const energy = (irradiance / 1000) * effectiveEfficiency * 3; // kWh/m²
    
    return Math.round(energy * 1000) / 1000; // Round to 3 decimals
  }

  /**
   * Helper: Calculate average
   */
  average(arr) {
    if (arr.length === 0) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  }

  /**
   * Check if weather service is enabled
   */
  isEnabled() {
    return this.enabled;
  }
}

module.exports = new WeatherService();
