let question = document.querySelector("#question");
let sendBtn = document.querySelector("#sendQuestion");
let chatBox = document.querySelector("#chat-box");


question.addEventListener("keypress", (e) => {

    if (e.key === "Enter") {

        sendBtn.click();
    };
});




sendBtn.addEventListener("click", async () => {

    let userQuestion = question.value;

    if (userQuestion === "") {
        return;
    }


    chatBox.innerHTML +=
        `<div class="user-msg msg-content">
            <p>${userQuestion}</p>
        </div>`;

    chatBox.scrollTop = chatBox.scrollHeight;

    question.value = "";


    let response = await fetch("/api/chat", {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            question: userQuestion
        })
    });


    let data = await response.json();

    console.log(data);


    // question.value = "";


    let aiBox = document.createElement("div");

    aiBox.className = "ai-msg msg-content";

    chatBox.appendChild(aiBox);


    let aiMessage = data.answer;

    let i = 0;


    function typeMsg() {

        if (i < aiMessage.length) {

            aiBox.innerHTML += aiMessage[i];

            i++;

            chatBox.scrollTop = chatBox.scrollHeight;

            setTimeout(typeMsg, 10);
        }
    }


    typeMsg();

});