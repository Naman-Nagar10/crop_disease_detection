let buttons = document.querySelectorAll(".sidebar-btn");

buttons.forEach((btn) => {

    btn.addEventListener("click", () => {

        buttons.forEach((item) => {
            item.classList.remove("active");
        });

        btn.classList.add("active");

    });

});