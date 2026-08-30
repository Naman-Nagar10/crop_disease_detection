let state = document.querySelector("#state");
let district = document.querySelector("#district");
let crop = document.querySelector("#crop");
let button = document.querySelector("#mandi-price");

let districts = {
    up: ["Muzaffarnagar", "Meerut", "Agra", "Saharnpur"],
    punjab: ["Amritsar", "Ludhiana", "Patiala"],
    haryana: ["Karnal", "Hisar", "Panipat"],
    maharashtra: ["Nashik", "Pune", "Nagpur"]
};

state.addEventListener("change", () => {

    district.innerHTML = "<option>Select District</option>";

    let selectedDistricts = districts[state.value];

    selectedDistricts.forEach( function (item) {
        district.innerHTML += `<option>${item}</option>`;
    });

    district.disabled = false;

})


district.addEventListener("change", () => {
    crop.disabled = false;
});


crop.addEventListener("change", () =>{
    button.disabled = false;
});


button.addEventListener("click", function () {

    let selectedState =
        state.options[state.selectedIndex].text;

    let selectedDistrict =
        district.options[district.selectedIndex].text;

    let selectedCrop =
        crop.options[crop.selectedIndex].text;


    document.getElementById("marketName").innerText =
        selectedDistrict;

    document.getElementById("cropName").innerText =
        selectedCrop;

    document.getElementById("minPrice").innerText =
        "₹ 2000";

    document.getElementById("maxPrice").innerText =
        "₹ 2500";

    document.getElementById("modalPrice").innerText =
        "₹ 2300";
});