require("dotenv").config();


const express = require("express");
const app = express();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});



const path = require("path");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

//===========HOME ROUTE================
app.get("/", (req, res) => {
    res.render("index.ejs");
});



app.post("/api/chat", async (req, res) => {

    let userQuestion = req.body.question;

    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: userQuestion
    });

    const answer = response.text;

    res.json({
        answer: answer
    });

});

const port = 8080;
app.listen(port, () => {
    console.log(`server is listening on ${port}`);
});