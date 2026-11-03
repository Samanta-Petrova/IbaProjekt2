const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Placering af brugerfilen
const usersFile = path.join(__dirname, "data", "users.json");

// Sørg for, at data-mappen og brugerfilen findes
if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"));
}

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, "[]");
}

// Gør det muligt at modtage JSON fra frontend
app.use(express.json());

// Håndtering af login-sessioner
app.use(session({
    secret: "vejrapp-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Gør HTML, CSS og JavaScript tilgængeligt
app.use(express.static(path.join(__dirname, "public")));

// Læs brugerne fra JSON-filen
function getUsers() {
    const data = fs.readFileSync(usersFile, "utf8");

    if (!data.trim()) {
        return [];
    }

    return JSON.parse(data);
}

// Gem brugerne i JSON-filen
function saveUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Find den bruger, der er logget ind
function getLoggedInUser(req) {
    const users = getUsers();

    return users.find(function(user) {
        return user.id === req.session.userId;
    });
}

// Fjern adgangskoden, før brugerdata sendes til frontend
function safeUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        preferences: user.preferences
    };
}

// Registrering af ny bruger
app.post("/api/register", async function(req, res) {
    try {
        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;

        if (!username || !email || !password) {
            return res.status(400).json({
                error: "Udfyld alle felter."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: "Adgangskoden skal være mindst 6 tegn."
            });
        }

        const users = getUsers();

        const existingUser = users.find(function(user) {
            return user.email.toLowerCase() === email.toLowerCase();
        });

        if (existingUser) {
            return res.status(409).json({
                error: "Denne e-mail er allerede registreret."
            });
        }

        // Krypter adgangskoden
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: Date.now().toString(),
            username: username,
            email: email,
            password: hashedPassword,
            preferences: {
                ageGroup: "adult",
                clothingStyle: "casual",
                warmth: "normal",
                favoriteLocations: []
            }
        };

        users.push(newUser);
        saveUsers(users);

        // Gem brugerens ID i sessionen
        req.session.userId = newUser.id;

        res.json({
            message: "Brugeren er oprettet.",
            user: safeUser(newUser)
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            error: "Kunne ikke oprette bruger."
        });
    }
});

// Login
app.post("/api/login", async function(req, res) {
    try {
        const email = req.body.email;
        const password = req.body.password;

        const users = getUsers();

        const user = users.find(function(user) {
            return user.email.toLowerCase() === (email || "").toLowerCase();
        });

        if (!user) {
            return res.status(401).json({
                error: "Forkert e-mail eller adgangskode."
            });
        }

        const passwordIsCorrect = await bcrypt.compare(password, user.password);

        if (!passwordIsCorrect) {
            return res.status(401).json({
                error: "Forkert e-mail eller adgangskode."
            });
        }

        req.session.userId = user.id;

        res.json({
            message: "Du er logget ind.",
            user: safeUser(user)
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            error: "Login mislykkedes."
        });
    }
});

// Log ud
app.post("/api/logout", function(req, res) {
    req.session.destroy(function() {
        res.clearCookie("connect.sid");

        res.json({
            message: "Du er logget ud."
        });
    });
});

// Hent den aktuelle bruger
app.get("/api/me", function(req, res) {
    const user = getLoggedInUser(req);

    if (!user) {
        return res.json({ user: null });
    }

    res.json({
        user: safeUser(user)
    });
});

// Gem brugerens præferencer
app.put("/api/preferences", function(req, res) {
    const user = getLoggedInUser(req);

    if (!user) {
        return res.status(401).json({
            error: "Du skal være logget ind."
        });
    }

    const users = getUsers();

    const userIndex = users.findIndex(function(item) {
        return item.id === user.id;
    });

    users[userIndex].preferences = {
        ageGroup: req.body.ageGroup,
        clothingStyle: req.body.clothingStyle,
        warmth: req.body.warmth,
        favoriteLocations: req.body.favoriteLocations || []
    };

    saveUsers(users);

    res.json({
        message: "Dine præferencer er gemt.",
        user: safeUser(users[userIndex])
    });
});

// Søg efter byer
app.get("/api/geocode", async function(req, res) {
    try {
        const city = req.query.q;

        if (!city || city.length < 2) {
            return res.status(400).json({
                error: "Indtast mindst to tegn."
            });
        }

        const url = "https://geocoding-api.open-meteo.com/v1/search?name="
            + encodeURIComponent(city)
            + "&count=5&language=da&format=json";

        const response = await fetch(url);
        const data = await response.json();

        res.json({
            results: data.results || []
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            error: "Kunne ikke søge efter lokationen."
        });
    }
});

// Hent vejret for en lokation
app.get("/api/weather", async function(req, res) {
    try {
        const latitude = Number(req.query.latitude);
        const longitude = Number(req.query.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return res.status(400).json({
                error: "Ugyldige koordinater."
            });
        }

        const url = new URL("https://api.open-meteo.com/v1/forecast");

        url.searchParams.set("latitude", latitude);
        url.searchParams.set("longitude", longitude);

        url.searchParams.set(
            "current",
            "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m"
        );

        url.searchParams.set(
            "daily",
            "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset"
        );

        url.searchParams.set("timezone", "auto");
        url.searchParams.set("forecast_days", "5");

        const response = await fetch(url);
        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.log(error);

        res.status(500).json({
            error: "Kunne ikke hente vejrudsigten."
        });
    }
});

// Start serveren
app.listen(PORT, function() {
    console.log("Vejrappen kører på http://localhost:" + PORT);
});