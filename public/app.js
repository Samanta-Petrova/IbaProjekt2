
// Find HTML-elementer
const $ = id => document.getElementById(id);

let currentLocation = null;
let currentWeather = null;
let currentUser = null;


// Hent data fra serveren
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Der opstod en fejl.");
    }

    return data;
}


// Vis beskeder
function showMessage(id, message) {
    $(id).textContent = message;
}


// Find beskrivelse og ikon ud fra vejrkoden
function getWeatherInfo(code, isDay = true) {
    if (code === 0) {
        return { description: "Klart vejr", icon: isDay ? "☀️" : "🌙" };
    }

    if (code === 1) return { description: "Overvejende klart", icon: "🌤️" };
    if (code === 2) return { description: "Delvist skyet", icon: "⛅" };
    if (code === 3) return { description: "Overskyet", icon: "☁️" };
    if ([45, 48].includes(code)) return { description: "Tåge", icon: "🌫️" };
    if ([51, 53, 55, 56, 57].includes(code)) return { description: "Støvregn", icon: "🌧️" };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { description: "Regn", icon: "🌧️" };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { description: "Sne", icon: "❄️" };
    if ([95, 96, 99].includes(code)) return { description: "Tordenvejr", icon: "⛈️" };

    return { description: "Ukendt vejr", icon: "🌡️" };
}


// Hent og vis vejret
async function loadWeather(latitude, longitude, locationName) {
    try {
        showMessage("global-message", "Henter vejrudsigten...");

        const data = await api(
            `/api/weather?latitude=${latitude}&longitude=${longitude}`
        );

        currentLocation = { latitude, longitude, name: locationName };
        currentWeather = data;

        $("weather-section").classList.remove("hidden");
        $("location-name").textContent = locationName;

        renderCurrentWeather(data);
        renderForecast(data);
        renderClothing(data);

        $("favorite-button").textContent = isFavorite(locationName)
            ? "★ Gemt lokation"
            : "☆ Gem lokation";

        showMessage("global-message", "");

        $("weather-section").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        showMessage("global-message", error.message);
    }
}


// Vis det aktuelle vejr
function renderCurrentWeather(data) {
    const current = data.current;
    const info = getWeatherInfo(current.weather_code, current.is_day === 1);

    $("weather-description").textContent = info.description;
    $("weather-icon").textContent = info.icon;
    $("temperature").textContent = `${Math.round(current.temperature_2m)}°`;
    $("feels-like").textContent = `Føles som ${Math.round(current.apparent_temperature)}°`;
    $("feels-detail").textContent = `${Math.round(current.apparent_temperature)}°`;
    $("wind").textContent = `${Math.round(current.wind_speed_10m)} km/t`;
    $("humidity").textContent = `${current.relative_humidity_2m}%`;
    $("precipitation").textContent = `${current.precipitation} mm`;

    $("weather-date").textContent = new Date().toLocaleDateString("da-DK", {
        weekday: "long",
        day: "numeric",
        month: "long"
    });
}


// Vis vejrudsigten for de næste fem dage
function renderForecast(data) {
    const daily = data.daily;
    const container = $("forecast-container");

    container.innerHTML = "";

    daily.time.forEach((date, index) => {
        const info = getWeatherInfo(daily.weather_code[index]);
        const day = new Date(date + "T12:00:00").toLocaleDateString(
            "da-DK",
            { weekday: "short" }
        );

        const card = document.createElement("div");
        card.className = "forecast-card";

        const elements = [
            ["p", "forecast-day", day],
            ["div", "forecast-icon", info.icon],
            ["p", "forecast-description", info.description],
            ["div", "forecast-temperature",
                `${Math.round(daily.temperature_2m_max[index])}° / ${Math.round(daily.temperature_2m_min[index])}°`],
            ["p", "forecast-rain",
                `Regn: ${daily.precipitation_probability_max[index] ?? 0}%`]
        ];

        elements.forEach(([tag, className, content]) => {
            const element = document.createElement(tag);
            element.className = className;
            element.textContent = content;
            card.appendChild(element);
        });

        container.appendChild(card);
    });
}


// Lav tøjanbefalinger ud fra vejret
function renderClothing(data) {
    const current = data.current;

    let temperature = current.apparent_temperature;

    const preferences = currentUser?.preferences || {
        ageGroup: "adult",
        clothingStyle: "casual",
        warmth: "normal"
    };

    // Tilpas temperaturen efter brugerens præference
    if (preferences.warmth === "warm") temperature -= 3;
    if (preferences.warmth === "cold") temperature += 3;

    let title = "";
    let description = "";
    let clothes = [];

    if (temperature < 0) {
        title = "Det er meget koldt!";
        description = "Vælg varmt tøj, så du holder varmen.";
        clothes = ["Varm vinterjakke", "Hue", "Handsker", "Varme bukser"];

    } else if (temperature < 10) {
        title = "Tag varmt tøj på";
        description = "Det er køligt udenfor, så en god jakke er en fordel.";
        clothes = ["Varm jakke", "Langærmet trøje", "Lange bukser"];

    } else if (temperature < 17) {
        title = "Klæd dig i lag";
        description = "Vejret er mildt, men du kan få brug for et ekstra lag.";
        clothes = ["Let jakke", "Trøje", "Lange bukser"];

    } else if (temperature < 23) {
        title = "Behageligt vejr";
        description = "Du kan vælge lettere tøj i dag.";
        clothes = ["T-shirt", "Lette bukser", "Eventuelt en tynd trøje"];

    } else {
        title = "Det er varmt!";
        description = "Vælg let og luftigt tøj.";
        clothes = ["T-shirt", "Shorts", "Luftigt tøj"];
    }

    // Tilpas tøjet efter aldersgruppe
    if (preferences.ageGroup === "child") {
        if (temperature < 10) clothes.push("Varmt ekstra lag");
        if (temperature >= 10 && temperature < 17) clothes.push("Ekstra trøje");
    }

    // Tilpas tøjet efter stil
    if (preferences.clothingStyle === "sporty") clothes.push("Sportssko");
    if (preferences.clothingStyle === "formal") clothes.push("Pænt overtøj");

    // Tilføj regntøj, hvis det regner
    const rainyWeather = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];

    if (current.precipitation > 0 || rainyWeather.includes(current.weather_code)) {
        clothes.push("Regnjakke eller paraply");
    }

    // Tilføj vindtæt tøj, hvis det blæser meget
    if (current.wind_speed_10m > 30) {
        clothes.push("Vindtæt overtøj");
    }

    // Vis anbefalingerne
    $("clothing-title").textContent = title;
    $("clothing-description").textContent = description;

    const container = $("clothing-items");
    container.innerHTML = "";

    clothes.forEach(item => {
        const element = document.createElement("span");
        element.className = "clothing-item";
        element.textContent = item;
        container.appendChild(element);
    });

    $("personal-note").textContent = currentUser
        ? "Anbefalingerne er tilpasset dine personlige præferencer."
        : "Dette er generelle anbefalinger. Log ind for at tilpasse dem.";
}


// Søg efter en by
$("search-form").addEventListener("submit", async event => {
    event.preventDefault();

    const city = $("city-input").value.trim();
    if (!city) return;

    try {
        const data = await api(`/api/geocode?q=${encodeURIComponent(city)}`);
        const results = $("search-results");

        results.innerHTML = "";

        if (!data.results.length) {
            showMessage("global-message", "Ingen lokationer fundet.");
            return;
        }

        data.results.forEach(place => {
            const button = document.createElement("button");
            button.className = "search-result";
            button.textContent = `${place.name}, ${place.country}`;

            button.addEventListener("click", () => {
                results.innerHTML = "";
                loadWeather(place.latitude, place.longitude, place.name);
            });

            results.appendChild(button);
        });

    } catch (error) {
        showMessage("global-message", error.message);
    }
});


// Hent brugerens aktuelle placering
$("location-button").addEventListener("click", () => {
    if (!navigator.geolocation) {
        showMessage("global-message", "Din browser understøtter ikke geolokalisering.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {
            loadWeather(
                position.coords.latitude,
                position.coords.longitude,
                "Din aktuelle placering"
            );
        },
        () => {
            showMessage("global-message", "Du har ikke givet tilladelse til at bruge din placering.");
        }
    );
});


// Åbn og luk konto-sektionen
$("account-toggle").addEventListener("click", () => {
    $("account-section").classList.toggle("hidden");
});


// Skift mellem login og registrering
$("show-login").addEventListener("click", () => {
    $("login-form").classList.remove("hidden");
    $("register-form").classList.add("hidden");
    $("show-login").classList.add("active");
    $("show-register").classList.remove("active");
});

$("show-register").addEventListener("click", () => {
    $("register-form").classList.remove("hidden");
    $("login-form").classList.add("hidden");
    $("show-register").classList.add("active");
    $("show-login").classList.remove("active");
});


// Registrer en bruger
$("register-form").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/api/register", {
            method: "POST",
            body: JSON.stringify({
                username: $("register-username").value,
                email: $("register-email").value,
                password: $("register-password").value
            })
        });

        setUser(data.user);
        showMessage("account-message", "Din bruger er oprettet.");
        $("register-form").reset();

    } catch (error) {
        showMessage("account-message", error.message);
    }
});


// Log ind
$("login-form").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                email: $("login-email").value,
                password: $("login-password").value
            })
        });

        setUser(data.user);
        showMessage("account-message", "Du er logget ind.");
        $("login-form").reset();

    } catch (error) {
        showMessage("account-message", error.message);
    }
});


// Opdater siden, når brugerens status ændres
function setUser(user) {
    currentUser = user;

    if (user) {
        $("user-status").textContent = `Hej, ${user.username}`;
        $("account-toggle").textContent = "Min konto";

        $("auth-forms").classList.add("hidden");
        $("user-settings").classList.remove("hidden");

        $("age-group").value = user.preferences.ageGroup;
        $("clothing-style").value = user.preferences.clothingStyle;
        $("warmth").value = user.preferences.warmth;

        $("favorites-section").classList.remove("hidden");
        renderFavorites();

    } else {
        $("user-status").textContent = "Gæst";
        $("account-toggle").textContent = "Log ind";

        $("auth-forms").classList.remove("hidden");
        $("user-settings").classList.add("hidden");
        $("favorites-section").classList.add("hidden");
    }

    if (currentWeather) {
        renderClothing(currentWeather);
    }
}


// Gem brugerens præferencer
$("preferences-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) return;

    try {
        const data = await api("/api/preferences", {
            method: "PUT",
            body: JSON.stringify({
                ageGroup: $("age-group").value,
                clothingStyle: $("clothing-style").value,
                warmth: $("warmth").value,
                favoriteLocations: currentUser.preferences.favoriteLocations || []
            })
        });

        setUser(data.user);
        showMessage("account-message", "Dine præferencer er gemt.");

    } catch (error) {
        showMessage("account-message", error.message);
    }
});


// Log ud
$("logout-button").addEventListener("click", async () => {
    try {
        await api("/api/logout", { method: "POST" });
        setUser(null);
        showMessage("account-message", "Du er logget ud.");

    } catch (error) {
        showMessage("account-message", error.message);
    }
});


// Undersøg om en lokation er gemt som favorit
function isFavorite(locationName) {
    const favorites = currentUser?.preferences.favoriteLocations || [];
    return favorites.includes(locationName);
}


// Gem eller fjern en favoritlokation
$("favorite-button").addEventListener("click", async () => {
    if (!currentUser) {
        showMessage("global-message", "Log ind for at gemme dine favoritlokationer.");
        return;
    }

    if (!currentLocation) return;

    let favorites = [...(currentUser.preferences.favoriteLocations || [])];

    if (favorites.includes(currentLocation.name)) {
        favorites = favorites.filter(name => name !== currentLocation.name);
    } else {
        if (favorites.length >= 10) {
            showMessage("global-message", "Du kan maksimalt gemme 10 lokationer.");
            return;
        }

        favorites.push(currentLocation.name);
    }

    try {
        const data = await api("/api/preferences", {
            method: "PUT",
            body: JSON.stringify({
                ...currentUser.preferences,
                favoriteLocations: favorites
            })
        });

        setUser(data.user);

        $("favorite-button").textContent = isFavorite(currentLocation.name)
            ? "★ Gemt lokation"
            : "☆ Gem lokation";

        showMessage("global-message", "Favoritter er opdateret.");

    } catch (error) {
        showMessage("global-message", error.message);
    }
});


// Vis gemte favoritlokationer
function renderFavorites() {
    const container = $("favorites-container");
    container.innerHTML = "";

    const favorites = currentUser?.preferences.favoriteLocations || [];

    favorites.forEach(location => {
        const card = document.createElement("div");
        card.className = "favorite-card";

        const name = document.createElement("span");
        name.textContent = location;

        const button = document.createElement("button");
        button.textContent = "Vis vejr";

        button.addEventListener("click", async () => {
            try {
                const data = await api(`/api/geocode?q=${encodeURIComponent(location)}`);

                if (data.results.length) {
                    const place = data.results[0];
                    loadWeather(place.latitude, place.longitude, place.name);
                }

            } catch (error) {
                showMessage("global-message", error.message);
            }
        });

        card.append(name, button);
        container.appendChild(card);
    });
}


// Kontroller om brugeren allerede er logget ind
async function checkLogin() {
    try {
        const data = await api("/api/me");
        setUser(data.user);

    } catch (error) {
        setUser(null);
    }
}


// Start appen
async function init() {
    await checkLogin();

    // Aalborg vises som standard
    await loadWeather(57.048, 9.919, "Aalborg");
}

init();
