let question = document.querySelector("#question");
let sendBtn = document.querySelector("#sendQuestion");
let chatBox = document.querySelector("#chat-box");


sendBtn.addEventListener("click", () => {
    let userQuestion = question.value;
    
    if(userQuestion === "") {
        return;
    }


    chatBox.innerHTML += 
        `<div class="user-msg msg-content">
            <p>${userQuestion}</p>
        </div>`;


    let aiMessege = ` hello i am an Ai Chatbot. 
        I am developed by NAMAN NAGAR for his SIH (Smart India Hackathon. Thonkyou!)`;

    let aiBox = document.createElement("div");
    aiBox.className = "ai-msg msg-content";

    chatBox.appendChild(aiBox);

    let i = 0;

    function typeMsg() {
        if (i < aiMessege.length) {

            aiBox.innerHTML += aiMessege[i];
            i++;

            chatBox.scrollTop = chatBox.scrollHeight;

            setTimeout(typeMsg, 30);
        }
    }

    typeMsg();



        question.value = "";

});


