const express = require("express");
const app = express();

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

const port = 8080;
app.listen(port, () => {
    console.log(`server is listening on ${port}`);
});