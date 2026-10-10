
//
const DATA_GOV_API_KEY = "579b464db66ec23bdd000001e07fb9fbfe594ac069927fdb4606b976";
const DATA_GOV_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_URL = `https://api.data.gov.in/resource/${DATA_GOV_RESOURCE_ID}`;

function initializeMandiPrice() {
    const stateSelect = document.getElementById("state");
    const districtSelect = document.getElementById("district");
    const cropSelect = document.getElementById("crop");
    const mandiButton = document.getElementById("mandi-price");
    const statusElement = document.getElementById("mandiStatus");
    const resultElement = document.getElementById("priceResult");
//

    if (!stateSelect || !districtSelect || !cropSelect || !mandiButton) {
        console.error("Mandi section: required HTML elements missing.");
        return;
    }

  // The data.gov API key stays on the server.
    const MANDI_API_URL = "/api/mandi-prices";

    const STATES = [
        "Uttar Pradesh",
        "Punjab",
        "Haryana",
        "Maharashtra",
        "Madhya Pradesh"
    ];

    // Shown only when the live data.gov.in service is unreachable.

    const SAMPLE_RECORDS = [
        ["Uttar Pradesh", "Lucknow", "Lucknow", "Wheat", 2200, 2450, 2325],
        ["Uttar Pradesh", "Lucknow", "Lucknow", "Paddy", 2100, 2350, 2220],
        ["Uttar Pradesh", "Lucknow", "Lucknow", "Potato", 900, 1400, 1150],
        ["Punjab", "Ludhiana", "Ludhiana", "Wheat", 2250, 2500, 2380],
        ["Punjab", "Ludhiana", "Ludhiana", "Paddy", 2150, 2400, 2280],
        ["Punjab", "Ludhiana", "Ludhiana", "Maize", 1900, 2150, 2025],
        ["Haryana", "Karnal", "Karnal", "Wheat", 2200, 2480, 2340],
        ["Haryana", "Karnal", "Karnal", "Paddy", 2100, 2380, 2240],
        ["Haryana", "Karnal", "Karnal", "Mustard", 5200, 5700, 5450],
        ["Maharashtra", "Pune", "Pune", "Onion", 1300, 2100, 1700],
        ["Maharashtra", "Pune", "Pune", "Tomato", 1800, 2800, 2300],
        ["Maharashtra", "Pune", "Pune", "Soyabean", 3900, 4400, 4150],
        ["Madhya Pradesh", "Indore", "Indore", "Wheat", 2200, 2500, 2350],
        ["Madhya Pradesh", "Indore", "Indore", "Soyabean", 4000, 4500, 4250],
        ["Madhya Pradesh", "Indore", "Indore", "Gram", 5000, 5500, 5250]
    ].map(([state, district, market, commodity, min_price, max_price, modal_price]) => ({
        state,
        district,
        market,
        commodity,
        arrival_date: "Sample data",
        min_price,
        max_price,
        modal_price
    }));

    let stateRequest = 0;
    let cropRequest = 0;

    function setStatus(message) {
        if (statusElement) statusElement.textContent = message;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function resetSelect(select, message) {
        select.replaceChildren(new Option(message, ""));
    }

    function uniqueSorted(values) {
        return [...new Set(
            values.map(value => String(value || "").trim()).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));
    }

    function getSampleRecords(filters = {}) {
        return SAMPLE_RECORDS.filter(record => (
            (!filters.state || record.state === filters.state) &&
            (!filters.district || record.district === filters.district) &&
            (!filters.commodity || record.commodity === filters.commodity)
        ));
    }

    async function fetchMandiApi(params = {}) {
        const url = new URL(MANDI_API_URL, window.location.origin);

        Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.set(key, value);
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: { Accept: "application/json" },
                cache: "no-store",
                signal: controller.signal
            });

            const data = await response.json().catch(() => null);

            if (!response.ok || !data?.success) {
                throw new Error(
                    data?.message || data?.error ||
                    `Mandi API HTTP error: ${response.status}`
                );
            }

            return data;
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("Mandi service timeout हो गई। दोबारा कोशिश करें।");
            }

            if (error instanceof TypeError) {
                throw new Error(
                    "Mandi service से connection fail हुआ। Server चालू है या नहीं जाँचें।"
                );
            }

            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function fetchRecords(filters = {}) {
        const data = await fetchMandiApi(filters);

        if (!Array.isArray(data.records)) {
            throw new Error("Mandi records नहीं मिले।");
        }

        return data.records;
    }

    async function fetchValues(type, filters = {}) {
        const data = await fetchMandiApi({ type, ...filters });

        if (!Array.isArray(data.values)) {
            throw new Error("Mandi options नहीं मिलीं।");
        }

        return data.values;
    }

    function fillOptions(select, values, placeholder) {
        resetSelect(select, placeholder);

        values.forEach(value => {
            select.add(new Option(value, value));
        });

        select.disabled = values.length === 0;
    }

    function renderPrices(records, state, district, crop, isSample = false) {
        if (!resultElement) return;

        resultElement.classList.add("is-visible");
        resultElement.classList.remove("is-loading");

        if (!records.length) {
            resultElement.innerHTML = `
                <div class="alert alert-warning mt-3">
                    इस फसल के लिए मंडी भाव उपलब्ध नहीं हैं।
                </div>`;
            return;
        }

        const rows = records.map(record => `
            <tr>
                <td>${escapeHTML(record.market || "-")}</td>
                <td>${escapeHTML(record.commodity || crop)}</td>
                <td>${escapeHTML(record.arrival_date || "-")}</td>
                <td>₹${escapeHTML(record.min_price ?? "-")}</td>
                <td>₹${escapeHTML(record.max_price ?? "-")}</td>
                <td><strong>₹${escapeHTML(record.modal_price ?? "-")}</strong></td>
            </tr>
        `).join("");

        resultElement.innerHTML = `
            <h5>Mandi Prices</h5>
            ${isSample ? `
                <div class="alert alert-info mt-2" role="alert">
                      फसलों के न्यूनतम (Minimum) और अधिकतम (Maximum) कीमतों नीचे दिया गया है:
                </div>` : ""}
            <p>State: ${escapeHTML(state)}</p>
            <p>District: ${escapeHTML(district)}</p>
            <p>Crop: ${escapeHTML(crop)}</p>

            <div class="table-responsive">
                <table class="table table-bordered table-striped">
                    <thead>
                        <tr>
                            <th>Market</th>
                            <th>Crop</th>
                            <th>Date</th>
                            <th>Min Price</th>
                            <th>Max Price</th>
                            <th>Modal Price</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    // Initial dropdowns
    fillOptions(stateSelect, STATES, "State चुनें");
    resetSelect(districtSelect, "पहले State चुनें");
    resetSelect(cropSelect, "पहले District चुनें");

    districtSelect.disabled = true;
    cropSelect.disabled = true;
    mandiButton.disabled = true;

    setStatus("अपनी State चुनें।");

    // State -> District
    stateSelect.addEventListener("change", async () => {
        const requestId = ++stateRequest;
        ++cropRequest;

        const state = stateSelect.value;

        resetSelect(districtSelect, "District load हो रहे हैं...");
        resetSelect(cropSelect, "पहले District चुनें");

        districtSelect.disabled = true;
        cropSelect.disabled = true;
        mandiButton.disabled = true;

        if (resultElement) {
            resultElement.replaceChildren();
            resultElement.classList.remove("is-visible", "is-loading");
        }

        if (!state) {
            resetSelect(districtSelect, "पहले State चुनें");
            setStatus("State चुनें।");
            return;
        }

        setStatus("Districts load हो रहे हैं...");

        try {
            const districts = await fetchValues("districts", { state });

            if (requestId !== stateRequest) return;

            if (!districts.length) {
                throw new Error("District नहीं मिली।");
            }

            fillOptions(districtSelect, districts, "District चुनें");
            setStatus(`${districts.length} districts मिलीं।`);
        } catch (error) {
            if (requestId !== stateRequest) return;
            const districts = uniqueSorted(
                getSampleRecords({ state }).map(record => record.district)
            );

            if (districts.length) {
                fillOptions(districtSelect, districts, "District चुनें");
                setStatus("Live District unavailable है — demo/sample districts दिख रही हैं।");
            } else {
                resetSelect(districtSelect, "District load नहीं हुई");
                setStatus(error.message);
            }

            console.error("Mandi district error:", error);
        }
    });

    // District -> Crops
    districtSelect.addEventListener("change", async () => {
        const requestId = ++cropRequest;
        const state = stateSelect.value;
        const district = districtSelect.value;

        resetSelect(cropSelect, "Crops load हो रही हैं...");
        cropSelect.disabled = true;
        mandiButton.disabled = true;

        if (!district) {
            resetSelect(cropSelect, "पहले District चुनें");
            setStatus("District चुनें।");
            return;
        }

        setStatus("Crops load हो रही हैं...");

        try {
            const crops = await fetchValues("crops", { state, district });

            if (requestId !== cropRequest) return;

            if (!crops.length) {
                throw new Error("इस District में crops नहीं मिलीं।");
            }

            fillOptions(cropSelect, crops, "Crop चुनें");
            setStatus(`${crops.length} crops मिलीं।`);
        } catch (error) {
            if (requestId !== cropRequest) return;
            const crops = uniqueSorted(
                getSampleRecords({ state, district }).map(record => record.commodity)
            );

            if (crops.length) {
                fillOptions(cropSelect, crops, "Crop चुनें");
                setStatus("Live Price unavailable है —  MSP Prices दिख रही हैं।");
            } else {
                resetSelect(cropSelect, "Crops load नहीं हुईं");
                setStatus(error.message);
            }

            console.error("Mandi crop error:", error);
        }
    });

    cropSelect.addEventListener("change", () => {
        mandiButton.disabled = !cropSelect.value;

        if (cropSelect.value) {
            setStatus("मंडी भाव देखने के लिए बटन दबाएँ।");
        }
    });

    // Crop -> Mandi Prices
    mandiButton.addEventListener("click", async () => {
        const state = stateSelect.value;
        const district = districtSelect.value;
        const crop = cropSelect.value;

        if (!state || !district || !crop) {
            setStatus("State, District और Crop चुनें।");
            return;
        }

        const originalText = mandiButton.textContent;

        mandiButton.disabled = true;
        mandiButton.textContent = "भाव लोड हो रहे हैं...";
        setStatus("मंडी भाव प्राप्त किए जा रहे हैं...");

        try {
            const records = await fetchRecords({
                state,
                district,
                commodity: crop
            });

            renderPrices(records, state, district, crop);

            setStatus(records.length
                ? `${records.length} मंडी रिकॉर्ड मिले।`
                : "इस फसल के भाव उपलब्ध नहीं हैं।");
        } catch (error) {
            console.error("Mandi price error:", error);
            const sampleRecords = getSampleRecords({
                state,
                district,
                commodity: crop
            });

            if (sampleRecords.length) {
                renderPrices(sampleRecords, state, district, crop, true);
                setStatus("Live API unavailable है — MSP Prices दिख रही हैं।");
            } else if (resultElement) {
                resultElement.classList.add("is-visible");
                resultElement.innerHTML = `
                    <div class="alert alert-danger mt-3">
                        ${escapeHTML(error.message)}
                    </div>`;
                setStatus(error.message);
            }
        } finally {
            mandiButton.textContent = originalText;
            mandiButton.disabled = !cropSelect.value;
        }
    });
}


// the Mandi panel work if it is loaded after DOMContentLoaded.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMandiPrice, { once: true });
} else {
    initializeMandiPrice();
}
