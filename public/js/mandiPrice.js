
const DATA_GOV_API_KEY = "579b464db66ec23bdd000001cb26a982577a45b479c92b18c489c47b";
const DATA_GOV_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_URL = `https://api.data.gov.in/resource/${DATA_GOV_RESOURCE_ID}`;

const DEMO_STATES = [
    "Uttar Pradesh",
    "Punjab",
    "Haryana",
    "Maharashtra",
    "Madhya Pradesh"
];

const mandiState = document.querySelector("#state");
const mandiDistrict = document.querySelector("#district");
const mandiCrop = document.querySelector("#crop");
const mandiButton = document.querySelector("#mandi-price");
const mandiStatus = document.querySelector("#mandiStatus");
const mandiResult = document.querySelector("#priceResult");

function setStatus(message) {
    if (mandiStatus) mandiStatus.textContent = message;
}

function setOptions(select, items, placeholder) {
    if (!select) return;

    select.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);

    items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = item;
        select.appendChild(option);
    });
}

function hideResult() {
    mandiResult?.classList.remove("is-visible", "is-loading");
}


async function getRecords(filters = {}, limit = 1000) {
    const url = new URL(DATA_GOV_URL);

    url.searchParams.set("api-key", DATA_GOV_API_KEY);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));

    Object.entries(filters).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(`filters[${key}]`, value);
        }
    });

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error || data?.message || "Mandi API response was not successful"
        );
    }

    return Array.isArray(data.records) ? data.records : [];
}

if (mandiState && mandiDistrict && mandiCrop && mandiButton) {
    // State -> District -> Crop -> Price
    setOptions(mandiState, DEMO_STATES, "State चुनें");
    setOptions(mandiDistrict, [], "पहले State चुनें");
    setOptions(mandiCrop, [], "पहले District चुनें");

    mandiDistrict.disabled = true;
    mandiCrop.disabled = true;
    mandiButton.disabled = true;

    // STATE -> DISTRICT-------------
    mandiState.addEventListener("change", async () => {
        hideResult();
        mandiDistrict.disabled = true;
        mandiCrop.disabled = true;
        mandiButton.disabled = true;

        setOptions(mandiDistrict, [], "District लोड हो रहे हैं...");
        setOptions(mandiCrop, [], "पहले District चुनें");

        if (!mandiState.value) {
            setOptions(mandiDistrict, [], "पहले State चुनें");
            setStatus("");
            return;
        }

        try {
            setStatus("District लोड हो रहे हैं...");

            const records = await getRecords({
                state: mandiState.value
            }, 1000);

            const districts = [
                ...new Set(
                    records
                        .map((row) => row.district)
                        .filter(Boolean)
                        .map((value) => String(value).trim())
                )
            ].sort((a, b) => a.localeCompare(b));

            if (!districts.length) {
                throw new Error("इस State के लिए District नहीं मिली");
            }

            setOptions(mandiDistrict, districts, "District चुनें");
            mandiDistrict.disabled = false;
            setStatus("District चुनें।");
        } catch (error) {
            console.error("District loading error:", error);
            setOptions(mandiDistrict, [], "District नहीं मिली");
            setStatus("District API से नहीं मिल सकी। थोड़ी देर बाद फिर try करें।");
        }
    });

    // DISTRICT -> CROP
    mandiDistrict.addEventListener("change", async () => {
        hideResult();
        mandiCrop.disabled = true;
        mandiButton.disabled = true;

        setOptions(mandiCrop, [], "फसल लोड हो रही है...");

        if (!mandiDistrict.value) {
            setOptions(mandiCrop, [], "पहले District चुनें");
            setStatus("");
            return;
        }

        try {
            setStatus("फसलें लोड हो रही हैं...");

            const records = await getRecords({
                state: mandiState.value,
                district: mandiDistrict.value
            }, 1000);

            const crops = [
                ...new Set(
                    records
                        .map((row) => row.commodity)
                        .filter(Boolean)
                        .map((value) => String(value).trim())
                )
            ].sort((a, b) => a.localeCompare(b));

            if (!crops.length) {
                throw new Error("इस District के लिए Crop नहीं मिली");
            }

            setOptions(mandiCrop, crops, "फसल चुनें");
            mandiCrop.disabled = false;
            setStatus("फसल चुनें।");
        } catch (error) {
            console.error("Crop loading error:", error);
            setOptions(mandiCrop, [], "Crop नहीं मिली");
            setStatus("इस District की फसल API से नहीं मिल सकी।");
        }
    });

    // CROP SELECT
    mandiCrop.addEventListener("change", () => {
        hideResult();
        mandiButton.disabled = !mandiCrop.value;
        setStatus(
            mandiCrop.value ? "भाव देखने के लिए बटन दबाएँ।" : ""
        );
    });

    // CROP -> MANDI PRICE
    mandiButton.addEventListener("click", async () => {
        mandiButton.disabled = true;
        mandiResult?.classList.add("is-visible", "is-loading");
        setStatus("आज के मंडी भाव खोजे जा रहे हैं...");

        try {
            const records = await getRecords({
                state: mandiState.value,
                district: mandiDistrict.value,
                commodity: mandiCrop.value
            }, 1000);

            if (!records.length) {
                throw new Error("मंडी भाव नहीं मिला");
            }

            const latestDate = records
                .map((row) => row.arrival_date)
                .filter(Boolean)
                .sort()
                .pop();

            const latestRecords = records.filter((row) => {
                return !latestDate || row.arrival_date === latestDate;
            });

            const prices = latestRecords
                .map((row) => ({
                    min: Number(row.min_price),
                    max: Number(row.max_price),
                    modal: Number(row.modal_price)
                }))
                .filter((row) =>
                    Number.isFinite(row.min) &&
                    Number.isFinite(row.max) &&
                    Number.isFinite(row.modal)
                );

            if (!prices.length) {
                throw new Error("Price data सही नहीं मिला");
            }

            const average = (key) => Math.round(
                prices.reduce((sum, item) => sum + item[key], 0) / prices.length
            );

            const rupees = (value) =>
                `₹ ${new Intl.NumberFormat("en-IN").format(value)} / क्विंटल`;

            const marketNames = [
                ...new Set(
                    latestRecords.map((row) => row.market).filter(Boolean)
                )
            ];

            document.querySelector("#marketName").textContent =
                marketNames.join(", ") || mandiDistrict.value;

            document.querySelector("#cropName").textContent = mandiCrop.value;
            document.querySelector("#minPrice").textContent =
                rupees(Math.min(...prices.map((item) => item.min)));
            document.querySelector("#maxPrice").textContent =
                rupees(Math.max(...prices.map((item) => item.max)));
            document.querySelector("#modalPrice").textContent =
                rupees(average("modal"));

            const priceDate = document.querySelector("#priceDate");
            if (priceDate) {
                priceDate.textContent = latestDate ? `(${latestDate})` : "";
            }

            setStatus(
                `${prices.length} मंडी रिकॉर्ड के आधार पर भाव दिखाए गए हैं।`
            );
        } catch (error) {
            console.error("Mandi price error:", error);
            mandiResult?.classList.remove("is-visible");
            setStatus(
                "भाव नहीं मिल सके। API key या चुने गए विकल्प जाँचें।"
            );
        } finally {
            mandiResult?.classList.remove("is-loading");
            mandiButton.disabled = !mandiCrop.value;
        }
    });
}
