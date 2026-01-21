const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const locationBtn = document.getElementById('location-btn');
const weatherIcon = document.getElementById('weather-icon');
const tempElement = document.getElementById('temp');
const feelsLikeElement = document.getElementById('feels-like');
const moonDisplay = document.getElementById('moon-display');
const moonIcon = document.getElementById('moon-icon');
const moonText = document.getElementById('moon-text');
const cityElement = document.getElementById('city');
const timeElement = document.getElementById('time');
const windElement = document.getElementById('wind');
const windDirElement = document.getElementById('wind-dir');
const humidityElement = document.getElementById('humidity');
const uvElement = document.getElementById('uv');
const sunriseElement = document.getElementById('sunrise');
const sunsetElement = document.getElementById('sunset');
const alertsContainer = document.getElementById('alerts-container');
const weatherContent = document.getElementById('weather-content');
const errorMessage = document.getElementById('error-message');
const container = document.querySelector('.container');
const unitSwitch = document.getElementById('unit-switch');
const cLabel = document.getElementById('c-label');
const fLabel = document.getElementById('f-label');
const loadingSpinner = document.getElementById('loading-spinner');
const ptrIndicator = document.getElementById('ptr-indicator');
const ptrIcon = ptrIndicator.querySelector('i');

let autoRefreshInterval;
let currentCity = '';
let isCelsius = true;
let lastWeatherData = null;
let lastDailyData = null;
let lastCityName = '';
let lastTimezone = '';
let lastHourlyData = null;
let tempChartInstance = null;
let pStartY = 0;
let isDragging = false;

// Initialize with user location on load
window.addEventListener('load', () => {
    createStars();
    getUserLocation();
});

// Pull to Refresh Logic
window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
        pStartY = e.touches[0].clientY;
        isDragging = true;
        container.style.transition = 'none';
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - pStartY;
    
    if (diff > 0 && window.scrollY === 0) {
        e.preventDefault();
        const move = Math.min(diff * 0.4, 100);
        container.style.transform = `translateY(${move}px)`;
        ptrIndicator.style.opacity = Math.min(move / 50, 1);
        
        if (move > 60) {
            ptrIcon.style.transform = 'rotate(180deg)';
        } else {
            ptrIcon.style.transform = 'rotate(0deg)';
        }
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    container.style.transition = 'transform 0.3s ease';
    
    const currentY = e.changedTouches[0].clientY;
    const diff = currentY - pStartY;
    
    if (diff > 150 && window.scrollY === 0) {
        container.style.transform = `translateY(60px)`;
        ptrIcon.className = "fa-solid fa-spinner fa-spin";
        
        refreshWeatherData().then(() => {
            setTimeout(resetPTR, 500);
        });
    } else {
        resetPTR();
    }
});

// Unit Toggle Logic
unitSwitch.addEventListener('change', () => {
    isCelsius = !unitSwitch.checked;
    if (isCelsius) {
        cLabel.classList.add('active-unit');
        cLabel.classList.remove('inactive-unit');
        fLabel.classList.remove('active-unit');
        fLabel.classList.add('inactive-unit');
    } else {
        cLabel.classList.remove('active-unit');
        cLabel.classList.add('inactive-unit');
        fLabel.classList.add('active-unit');
        fLabel.classList.remove('inactive-unit');
    }
    
    if (lastWeatherData) {
        updateUI(lastCityName, lastWeatherData, lastDailyData, lastTimezone, lastHourlyData);
    }
});

// Weather Logic
async function checkWeather(city) {
    if (!city.trim()) return;
    try {
        showLoading();
        // 1. Geocoding API to get Lat/Lon
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoResponse = await fetch(geoUrl);
        if (!geoResponse.ok) throw new Error("Geocoding API error");
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            hideLoading();
            showError("City not found!");
            return;
        }

        const { latitude, longitude, name } = geoData.results[0];
        await fetchWeatherData(latitude, longitude, name);

    } catch (error) {
        hideLoading();
        console.error(error);
        showError("Error searching city. Please try again.");
    }
}

async function fetchWeatherData(lat, lon, name) {
    try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m&daily=weathercode,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,sunrise,sunset&timezone=auto`;
        const response = await fetch(weatherUrl);
        if (!response.ok) throw new Error("Weather API error");
        const data = await response.json();
        
        currentCity = name; // Store for auto-refresh
        
        const current = data.current;
        lastWeatherData = {
            temperature: current.temperature_2m,
            windspeed: current.wind_speed_10m,
            winddirection: current.wind_direction_10m,
            weathercode: current.weather_code,
            is_day: current.is_day,
            time: current.time,
            humidity: current.relative_humidity_2m,
            feels_like: current.apparent_temperature
        };

        lastDailyData = data.daily;
        lastHourlyData = data.hourly;
        lastCityName = name;
        lastTimezone = data.timezone;
        updateUI(name, lastWeatherData, data.daily, data.timezone, data.hourly);
        hideLoading();
        
        // Setup Realtime Auto-Refresh (every 60 seconds)
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            refreshWeatherData();
        }, 60000);

    } catch (error) {
        hideLoading();
        console.error("Error fetching weather data:", error);
        showError("Unable to fetch weather data.");
    }
}

async function checkWeatherByCoords(lat, lon) {
    try {
        showLoading();
        // Reverse Geocoding to get City Name
        const reverseGeoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`;
        const response = await fetch(reverseGeoUrl);
        if (!response.ok) throw new Error("Reverse Geocoding API error");
        const data = await response.json();
        
        const cityName = data.results ? data.results[0].name : "Your Location";
        await fetchWeatherData(lat, lon, cityName);
    } catch (error) {
        hideLoading();
        console.error(error);
        showError("Unable to retrieve location.");
    }
}

function getWeatherIcon(code, isDay = 1) {
    const baseUrl = 'https://www.amcharts.com/wp-content/themes/amcharts4/css/img/icons/weather/animated/';
    
    if (code === 0) return `${baseUrl}${isDay ? 'day' : 'night'}.svg`;
    if (code >= 1 && code <= 3) return `${baseUrl}${isDay ? 'cloudy-day-1' : 'cloudy-night-1'}.svg`;
    if (code >= 45 && code <= 48) return `${baseUrl}cloudy.svg`;
    if (code >= 51 && code <= 67) return `${baseUrl}rainy-5.svg`;
    if (code >= 71 && code <= 77) return `${baseUrl}snowy-5.svg`;
    if (code >= 80 && code <= 82) return `${baseUrl}rainy-6.svg`;
    if (code >= 95) return `${baseUrl}thunder.svg`;
    return `${baseUrl}${isDay ? 'day' : 'night'}.svg`;
}

function getMoonPhase(phase) {
    if (phase === 0 || phase === 1) return { icon: '🌑', name: 'New Moon' };
    if (phase < 0.25) return { icon: '🌒', name: 'Waxing Crescent' };
    if (phase === 0.25) return { icon: '🌓', name: 'First Quarter' };
    if (phase < 0.5) return { icon: '🌔', name: 'Waxing Gibbous' };
    if (phase === 0.5) return { icon: '🌕', name: 'Full Moon' };
    if (phase < 0.75) return { icon: '🌖', name: 'Waning Gibbous' };
    if (phase === 0.75) return { icon: '🌗', name: 'Last Quarter' };
    return { icon: '🌘', name: 'Waning Crescent' };
}

function updateUI(cityName, weather, daily, timezone, hourly) {
    cityElement.innerHTML = cityName;
    
    // Update Background based on weather
    updateBackground(weather.weathercode, weather.is_day, weather.time, daily.sunrise[0], daily.sunset[0]);
    
    if (timezone) {
        const date = new Date();
        const options = { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit' };
        timeElement.innerHTML = date.toLocaleString('en-US', options);
    }
    
    const currentTemp = isCelsius ? weather.temperature : (weather.temperature * 9/5) + 32;
    tempElement.innerHTML = Math.round(currentTemp) + (isCelsius ? "°C" : "°F");

    const feelsLikeTemp = isCelsius ? weather.feels_like : (weather.feels_like * 9/5) + 32;
    feelsLikeElement.innerHTML = Math.round(feelsLikeTemp) + (isCelsius ? "°C" : "°F");

    windElement.innerHTML = weather.windspeed + " km/h";
    windDirElement.style.transform = `rotate(${weather.winddirection - 45}deg)`;
    humidityElement.innerHTML = weather.humidity + "%";
    uvElement.innerHTML = daily.uv_index_max[0];

    generateAlerts(weather, daily);

    // Sunrise and Sunset
    if (daily.sunrise && daily.sunset) {
        const sunriseDate = new Date(daily.sunrise[0]);
        const sunsetDate = new Date(daily.sunset[0]);
        sunriseElement.innerHTML = sunriseDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
        sunsetElement.innerHTML = sunsetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
    }

    // Map WMO Weather Codes to Images
    weatherIcon.src = getWeatherIcon(weather.weathercode, weather.is_day);

    // Moon Phase (Only at night)
    if (weather.is_day === 0 && daily.moon_phase) {
        const moon = getMoonPhase(daily.moon_phase[0]);
        moonIcon.innerText = moon.icon;
        moonText.innerText = moon.name;
        moonDisplay.style.display = 'flex';
    } else {
        moonDisplay.style.display = 'none';
    }

    // Render Chart
    if (hourly) {
        renderChart(hourly, weather.time);
    }

    // Render Forecast
    const forecastContainer = document.getElementById('forecast-container');
    forecastContainer.innerHTML = '';

    // Display next 7 days
    if (daily) {
        for(let i = 0; i < 7; i++) {
            const date = new Date(daily.time[i]);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            
            let maxTemp = daily.temperature_2m_max[i];
            let minTemp = daily.temperature_2m_min[i];
            const precipProb = daily.precipitation_probability_max[i];
            
            if (!isCelsius) {
                maxTemp = (maxTemp * 9/5) + 32;
                minTemp = (minTemp * 9/5) + 32;
            }
            
            const iconSrc = getWeatherIcon(daily.weathercode[i], 1);

            const item = document.createElement('div');
            item.classList.add('forecast-item');
            item.innerHTML = `
                <span class="day">${dayName}</span>
                <img src="${iconSrc}" alt="icon">
                <span class="precip"><i class="fa-solid fa-droplet"></i> ${precipProb}%</span>
                <span class="temp-range">${Math.round(maxTemp)}° / ${Math.round(minTemp)}°</span>
            `;
            forecastContainer.appendChild(item);
        }
    }

    // Reset animation to trigger it again
    weatherContent.style.display = "none";
    weatherContent.offsetHeight; // Trigger reflow
    weatherContent.style.display = "block";
    
    errorMessage.style.display = "none";
}

function renderChart(hourly, currentTimeStr) {
    const ctx = document.getElementById('tempChart').getContext('2d');
    
    // Find start index based on current time
    const currentHourStr = currentTimeStr.substring(0, 13) + ":00";
    let startIndex = hourly.time.indexOf(currentHourStr);
    if (startIndex === -1) startIndex = 0;

    const labels = [];
    const data = [];

    // Get next 24 hours
    for(let i = 0; i < 24; i++) {
        const index = startIndex + i;
        if (index < hourly.time.length) {
            const date = new Date(hourly.time[index]);
            const hours = date.getHours().toString().padStart(2, '0');
            labels.push(`${hours}:00`);
            
            let temp = hourly.temperature_2m[index];
            if (!isCelsius) {
                temp = (temp * 9/5) + 32;
            }
            data.push(temp);
        }
    }

    if (tempChartInstance) {
        tempChartInstance.destroy();
    }

    tempChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperature',
                data: data,
                borderColor: '#fff',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y.toFixed(1) + (isCelsius ? '°C' : '°F');
                        }
                    }
                }
            },
            scales: {
                x: { 
                    ticks: { color: 'rgba(255, 255, 255, 0.8)', maxTicksLimit: 6 },
                    grid: { display: false }
                },
                y: { 
                    ticks: { display: false },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function generateAlerts(weather, daily) {
    alertsContainer.innerHTML = '';
    const alerts = [];

    if (weather.temperature > 35) alerts.push({ msg: "Heat Advisory", icon: "fa-temperature-high" });
    if (weather.temperature < 0) alerts.push({ msg: "Freeze Warning", icon: "fa-snowflake" });
    if (weather.windspeed > 40) alerts.push({ msg: "High Wind Alert", icon: "fa-wind" });
    if (daily.uv_index_max[0] > 8) alerts.push({ msg: "High UV Alert", icon: "fa-sun" });
    if (daily.precipitation_probability_max[0] > 80) alerts.push({ msg: "High Rain Probability", icon: "fa-cloud-showers-heavy" });

    alerts.forEach(alert => {
        const div = document.createElement('div');
        div.className = 'alert-item';
        div.innerHTML = `<i class="fa-solid ${alert.icon}"></i> ${alert.msg}`;
        alertsContainer.appendChild(div);
    });
}

function showLoading() {
    loadingSpinner.style.display = "block";
    weatherContent.style.display = "none";
    errorMessage.style.display = "none";
}

function hideLoading() {
    loadingSpinner.style.display = "none";
}

function showError(message) {
    const errorText = errorMessage.querySelector('p');
    if (errorText) errorText.textContent = message || "City not found!";
    errorMessage.style.display = "block";
    weatherContent.style.display = "none";
}

searchBtn.addEventListener('click', () => {
    checkWeather(cityInput.value);
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        checkWeather(cityInput.value);
    }
});

locationBtn.addEventListener('click', getUserLocation);

function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                checkWeatherByCoords(latitude, longitude);
            },
            (error) => {
                alert("Unable to retrieve your location. Please enter city manually.");
            }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

function resetPTR() {
    container.style.transform = '';
    ptrIndicator.style.opacity = 0;
    ptrIcon.className = "fa-solid fa-arrow-down";
    ptrIcon.style.transform = '';
}

async function refreshWeatherData() {
    if (currentCity) {
        await checkWeather(currentCity);
    } else {
        getUserLocation();
    }
}

function updateBackground(code, isDay, currentTime, sunrise, sunset) {
    const body = document.body;
    body.className = ''; // Reset classes
    
    // Check for sunrise/sunset
    let isSunrise = false;
    let isSunset = false;

    if (currentTime && sunrise && sunset) {
        const current = new Date(currentTime).getTime();
        const sunriseTime = new Date(sunrise).getTime();
        const sunsetTime = new Date(sunset).getTime();
        const window = 60 * 60 * 1000; // 1 hour window

        if (Math.abs(current - sunriseTime) <= window) isSunrise = true;
        if (Math.abs(current - sunsetTime) <= window) isSunset = true;
    }

    if (isSunrise && code <= 3) {
        body.classList.add('bg-sunrise');
    } else if (isSunset && code <= 3) {
        body.classList.add('bg-sunset');
    } else if (code === 0 || code === 1) {
        body.classList.add(isDay ? 'bg-sunny' : 'bg-clear-night');
    } else if (code === 2 || code === 3 || (code >= 45 && code <= 48)) {
        body.classList.add('bg-cloudy');
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        body.classList.add('bg-rain');
    } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        body.classList.add('bg-snow');
    } else if (code >= 95) {
        body.classList.add('bg-storm');
    } else {
        body.classList.add(isDay ? 'bg-sunny' : 'bg-clear-night');
    }

    // Toggle Stars
    const starContainer = document.getElementById('star-container');
    if (starContainer) {
        if (body.classList.contains('bg-clear-night')) {
            starContainer.style.display = 'block';
        } else {
            starContainer.style.display = 'none';
        }
    }
}

function createStars() {
    const container = document.getElementById('star-container');
    if (!container) return;
    
    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 3;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.left = `${Math.random() * 100}%`;
        star.style.animationDuration = `${Math.random() * 3 + 2}s`;
        star.style.animationDelay = `${Math.random() * 2}s`;
        container.appendChild(star);
    }
}