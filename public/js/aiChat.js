document.addEventListener("DOMContentLoaded", () => {


    let question = document.querySelector("#question");
    let sendBtn = document.querySelector("#sendQuestion");
    let chatBox = document.querySelector("#chat-box");

    let chatOffcanvas = document.querySelector("#chatOffcanvas");

    let welcomeMsg = document.querySelector("#welcome-message");

    let spinner = document.querySelector("#send-spinner");
    let sendIcon = document.querySelector("#send-icon");


    // Welcome Message
    let welcomeText =
        "Welcome to AI साथी! यह एक AI-संचालित कृषि सहायता प्रणाली है, जो आपकी फसल, मौसम पूर्वानुमान एवं मंडी भावों पर वैज्ञानिक मार्गदर्शन प्रदान करती है। कृपया अपनी समस्या स्पष्ट रूप से बताएं।";

    let welcomeIndex = 0;
    let welcomeStarted = false;


    function typeWelcome() {

        if (welcomeIndex < welcomeText.length) {

            welcomeMsg.textContent += welcomeText[welcomeIndex];

            welcomeIndex++;

            chatBox.scrollTop = chatBox.scrollHeight;

            setTimeout(typeWelcome, 30);
        }
    }


    // Welcome typing
    chatOffcanvas.addEventListener("shown.bs.offcanvas", () => {

        if (welcomeStarted) {
            return;
        }

        welcomeStarted = true;

        typeWelcome();

    });


         // Send Question

    sendBtn.addEventListener("click", async () => {

        let userQuestion = question.value.trim();

        // Empty question
        if (userQuestion === "") {
            return;
        }


        // User message
        let userMsg = document.createElement("div");

        userMsg.className = "user-msg msg-content";

        let userPara = document.createElement("p");

        userPara.textContent = userQuestion;

        userMsg.appendChild(userPara);

        chatBox.appendChild(userMsg);


        chatBox.scrollTop = chatBox.scrollHeight;


        question.value = "";


        sendBtn.disabled = true;


        // Spinner ON
        spinner.classList.remove("d-none");

        sendIcon.classList.add("d-none");


        try {

            // Gemini API Request
           

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


            // Spinner OFF

            spinner.classList.add("d-none");

            sendIcon.classList.remove("d-none");

            sendBtn.disabled = false;


            // AI Message Box

            let aiBox = document.createElement("div");

            aiBox.className = "ai-msg msg-content";


            let aiPara = document.createElement("p");

            aiBox.appendChild(aiPara);

            chatBox.appendChild(aiBox);


            // Gemini answer
            let aiMessage = data.answer;


            // AI Typing Effect
            let i = 0;


            function typeMsg() {

                if (i < aiMessage.length) {

                    aiPara.textContent += aiMessage[i];

                    i++;

                    chatBox.scrollTop = chatBox.scrollHeight;

                    setTimeout(typeMsg, 30);

                }

            }


            typeMsg();


        } catch (error) {

            console.log(error);


            // Spinner OFF
            spinner.classList.add("d-none");

            sendIcon.classList.remove("d-none");

            sendBtn.disabled = false;


            // Error message
            let errorBox = document.createElement("div");

            errorBox.className = "ai-msg msg-content";

            errorBox.innerHTML =
                "<p>माफ कीजिए, अभी AI से response नहीं मिल पाया। कृपया थोड़ी देर बाद फिर कोशिश करें।</p>";


            chatBox.appendChild(errorBox);

            chatBox.scrollTop = chatBox.scrollHeight;

        }

    });


    // Enter Key

    question.addEventListener("keypress", (e) => {

        if (e.key === "Enter") {

            e.preventDefault();

            sendBtn.click();

        }

    });

});