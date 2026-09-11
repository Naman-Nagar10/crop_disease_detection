const buttons = document.querySelectorAll(".navigation-link");

buttons.forEach((btn) => {

    btn.addEventListener("click", () => {

        buttons.forEach((item) => {
            item.classList.remove("active");
        });

        btn.classList.add("active");

    });

});

// let helpBtn = document.querySelector(".help-btn");

// let helpPopover = new bootstrap.Popover(helpBtn, {
//     content: "यहाँ पर आपको AI से मदद मिल सकती है।",
//     trigger: "hover",
//     placement: "right",
//     html: true,
// });

document.querySelectorAll("[data-help-trigger]").forEach((helpButton) => {
    new bootstrap.Popover(helpButton, {
        html: true,
    });
});