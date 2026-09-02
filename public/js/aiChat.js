let question = document.querySelector("#question");
let sendBtn = document.querySelector("#sendQuestion");
let chatBox = document.querySelector("#chat-box");


let chatOffcanvas = document.querySelector("#chatOffcanvas");

let welcomeMsg = document.querySelector("#welcome-message");

let welcomeText =
    "Welcome to AI साथी! यह एक AI-संचालित कृषि सहायता प्रणाली है, जो आपकी फसल, मौसम पूर्वानुमान एवं मंडी भावों पर वैज्ञानिक मार्गदर्शन प्रदान करती है। कृपया अपनी समस्या स्पष्ट रूप से बताएं।";

let welcomeIndex = 0;
let welcomeStarted = false;

chatOffcanvas.addEventListener("shown.bs.offcanvas", () => {

    if (welcomeStarted) {
        return;
    }

    welcomeStarted = true;

    function typeWelcome() {

        if (welcomeIndex < welcomeText.length) {

            welcomeMsg.innerHTML += welcomeText[welcomeIndex];

            welcomeIndex++;

            setTimeout(typeWelcome, 30);
        }
    }

    typeWelcome();
});


// -----------enter key press------

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



    let aiBox = document.createElement("div");

    aiBox.className = "ai-msg msg-content";

    chatBox.appendChild(aiBox);



    // typing effect for AI message

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