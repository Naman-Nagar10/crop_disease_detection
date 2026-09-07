let buttons = document.querySelectorAll(".sidebar-btn");

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

let helpBtn = document.querySelector("#help-btn");

let helpPopover = new bootstrap.Popover(helpBtn, {
    html: true,
});