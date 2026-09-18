const buttons = document.querySelectorAll(".navigation-link");

buttons.forEach((btn) => {

    btn.addEventListener("click", () => {

        buttons.forEach((item) => {
            item.classList.remove("active");
        });

        btn.classList.add("active");

    });

});



document.querySelectorAll("[data-help-trigger]").forEach((helpButton) => {
    new bootstrap.Popover(helpButton, {
        html: true,
    });
});