
const DATA_GOV_API_KEY = "579b464db66ec23bdd000001cb26a982577a45b479c92b18c489c47b";
const DATA_GOV_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_URL = `https://api.data.gov.in/resource/${DATA_GOV_RESOURCE_ID}`;

// These keep the selection flow usable even before the API key is added.
// const FALLBACK_DISTRICTS = {
//     "Uttar Pradesh": ["Agra", "Meerut", "Muzaffarnagar", "Saharanpur"],
//     Punjab: ["Amritsar", "Ludhiana", "Patiala"],
//     Haryana: ["Hisar", "Karnal", "Panipat"],
//     Maharashtra: ["Nashik", "Nagpur", "Pune"],
//     "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur"],
//     Rajasthan: ["Jaipur", "Kota", "Udaipur"],
//     Bihar: ["Gaya", "Muzaffarpur", "Patna"]
// };
// const FALLBACK_CROPS = ["Wheat", "Paddy(Dhan)(Common)", "Potato", "Tomato", "Onion"];

const mandiState = document.querySelector("#state");
const mandiDistrict = document.querySelector("#district");
const mandiCrop = document.querySelector("#crop");
const mandiButton = document.querySelector("#mandi-price");
const mandiStatus = document.querySelector("#mandiStatus");
const mandiResult = document.querySelector("#priceResult");

if (mandiState && mandiDistrict && mandiCrop && mandiButton) {
    const setOptions = (select, items, placeholder) => {
        select.innerHTML = `<option value="">${placeholder}</option>` + items.map(item =>
            `<option value="${String(item).replaceAll('"', '&quot;')}">${item}</option>`).join("");
    };
    const setStatus = message => { if (mandiStatus) mandiStatus.textContent = message; };
    const resetResults = () => mandiResult?.classList.remove("is-visible");

    async function getRecords(filters = {}, limit = 100) {
        const url = new URL(DATA_GOV_URL);
        url.searchParams.set("api-key", DATA_GOV_API_KEY);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", String(limit));
        Object.entries(filters).forEach(([key, value]) => value && url.searchParams.set(`filters[${key}]`, value));
        const response = await fetch(url);
        if (!response.ok) throw new Error("Mandi API response was not successful");
        return (await response.json()).records || [];
    }

    mandiState.addEventListener("change", async () => {
        resetResults(); mandiDistrict.disabled = true; mandiCrop.disabled = true; mandiButton.disabled = true;
        setOptions(mandiDistrict, [], "District लोड हो रहे हैं..."); setOptions(mandiCrop, [], "पहले District चुनें");
        if (!mandiState.value) return setOptions(mandiDistrict, [], "पहले State चुनें");
        try {
            setStatus("District लोड हो रहे हैं...");
            const records = await getRecords({ state: mandiState.value }, 1000);
            const districts = [...new Set(records.map(row => row.district).filter(Boolean))].sort();
            setOptions(mandiDistrict, districts, "District चुनें"); mandiDistrict.disabled = false;
            setStatus(districts.length ? "District चुनें।" : "इस state के लिए अभी कोई मंडी रिकॉर्ड नहीं मिला।");
        } catch (error) {
            const districts = FALLBACK_DISTRICTS[mandiState.value] || [];
            setOptions(mandiDistrict, districts, "District चुनें");
            mandiDistrict.disabled = false;
            setStatus("API से district नहीं मिले; सूची से district चुनें।");
        }
    });

    mandiDistrict.addEventListener("change", async () => {
        resetResults(); mandiCrop.disabled = true; mandiButton.disabled = true;
        setOptions(mandiCrop, [], "फसल लोड हो रही है...");
        if (!mandiDistrict.value) return setOptions(mandiCrop, [], "पहले District चुनें");
        try {
            setStatus("फसलों की सूची लोड हो रही है...");
            const records = await getRecords({ state: mandiState.value, district: mandiDistrict.value }, 1000);
            const crops = [...new Set(records.map(row => row.commodity).filter(Boolean))].sort();
            setOptions(mandiCrop, crops, "फसल चुनें"); mandiCrop.disabled = false;
            setStatus(crops.length ? "फसल चुनें।" : "इस district के लिए कोई फसल रिकॉर्ड नहीं मिला।");
        } catch (error) {
            setOptions(mandiCrop, FALLBACK_CROPS, "फसल चुनें");
            mandiCrop.disabled = false;
            setStatus("API से फसलें नहीं मिलीं; सूची से फसल चुनें।");
        }
    });

    mandiCrop.addEventListener("change", () => { mandiButton.disabled = !mandiCrop.value; resetResults(); setStatus(mandiCrop.value ? "भाव देखने के लिए बटन दबाएँ।" : ""); });

    mandiButton.addEventListener("click", async () => {
        mandiButton.disabled = true; mandiResult?.classList.add("is-visible", "is-loading"); setStatus("आज के भाव खोजे जा रहे हैं...");
        try {
            const records = await getRecords({ state: mandiState.value, district: mandiDistrict.value, commodity: mandiCrop.value }, 100);
            if (!records.length) throw new Error("No mandi prices found");
            const latestDate = records.map(row => row.arrival_date).filter(Boolean).sort().pop();
            const latest = records.filter(row => !latestDate || row.arrival_date === latestDate);
            const prices = latest.map(row => ({ min: Number(row.min_price), max: Number(row.max_price), modal: Number(row.modal_price) })).filter(row => Number.isFinite(row.min) && Number.isFinite(row.max) && Number.isFinite(row.modal));
            if (!prices.length) throw new Error("Invalid mandi price data");
            const average = key => Math.round(prices.reduce((sum, row) => sum + row[key], 0) / prices.length);
            const inr = value => `₹ ${new Intl.NumberFormat("en-IN").format(value)} / क्विंटल`;
            document.querySelector("#marketName").textContent = latest.map(row => row.market).filter(Boolean).join(", ") || mandiDistrict.value;
            document.querySelector("#cropName").textContent = mandiCrop.value;
            document.querySelector("#minPrice").textContent = inr(Math.min(...prices.map(row => row.min)));
            document.querySelector("#maxPrice").textContent = inr(Math.max(...prices.map(row => row.max)));
            document.querySelector("#modalPrice").textContent = inr(average("modal"));
            const date = document.querySelector("#priceDate"); if (date) date.textContent = latestDate ? `(${latestDate})` : "";
            setStatus(`${prices.length} मंडी रिकॉर्ड के आधार पर भाव दिखाए गए हैं।`);
        } catch (error) { mandiResult?.classList.remove("is-visible"); setStatus("भाव नहीं मिल सके। API key, resource ID और चुने गए विकल्प जाँचें।"); }
        finally { mandiResult?.classList.remove("is-loading"); mandiButton.disabled = !mandiCrop.value; }
    });
}
