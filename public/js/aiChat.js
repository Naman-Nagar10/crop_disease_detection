document.addEventListener("DOMContentLoaded", () => {

    /* ================= ELEMENTS ================= */

    const question =
        document.querySelector("#question");

    const sendBtn =
        document.querySelector("#sendQuestion");

    const chatBox =
        document.querySelector("#chat-box");

    const chatOffcanvas =
        document.querySelector("#chatOffcanvas");

    const welcomeMsg =
        document.querySelector("#welcome-message");

    const spinner =
        document.querySelector("#send-spinner");

    const sendIcon =
        document.querySelector("#send-icon");

    const voiceBtn =
        document.querySelector("#voiceInput");

    const voiceIcon =
        document.querySelector("#voice-icon");


    /* ================= SAFETY CHECK ================= */

    if (
        !question ||
        !sendBtn ||
        !chatBox ||
        !chatOffcanvas ||
        !welcomeMsg
    ) {

        console.error(
            "AI Chat elements नहीं मिले।"
        );

        return;

    }


    /* ================= WELCOME ================= */

    const welcomeText =
        "Welcome to AI साथी! यह एक AI-संचालित कृषि सहायता प्रणाली है, जो आपकी फसल, मौसम पूर्वानुमान एवं मंडी भावों पर वैज्ञानिक मार्गदर्शन प्रदान करती है। कृपया अपनी समस्या स्पष्ट रूप से बताएं।";


    let welcomeIndex = 0;

    let welcomeStarted = false;


    function typeWelcome() {

        if (
            welcomeIndex >=
            welcomeText.length
        ) {

            return;

        }


        welcomeMsg.textContent +=
            welcomeText[welcomeIndex];


        welcomeIndex++;


        chatBox.scrollTop =
            chatBox.scrollHeight;


        setTimeout(
            typeWelcome,
            25
        );

    }


    /* ================= VOICE INPUT ================= */

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    let recognition = null;
    let isListening = false;

    if (voiceBtn && SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = "hi-IN";
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            isListening = true;
            voiceBtn.classList.add("listening");
            voiceBtn.title = "Listening...";
            voiceIcon.className = "fa-solid fa-microphone-lines";
        };

        recognition.onresult = (event) => {
            let transcript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }

            question.value = transcript;
        };

        recognition.onerror = (event) => {
            console.error("Voice input error:", event.error);

            if (event.error === "not-allowed") {
                alert("Microphone permission allow करें और फिर कोशिश करें।");
            }
        };

        recognition.onend = () => {
            isListening = false;
            voiceBtn.classList.remove("listening");
            voiceBtn.title = "Voice input";
            voiceIcon.className = "fa-solid fa-microphone";
        };

        voiceBtn.addEventListener("click", () => {
            if (isListening) {
                recognition.stop();
                return;
            }

            recognition.start();
        });
    } else if (voiceBtn) {
        voiceBtn.disabled = true;
        voiceBtn.title = "इस browser में voice input supported नहीं है";
    }


    /* ================= OPEN CHAT ================= */

    chatOffcanvas.addEventListener(
        "shown.bs.offcanvas",
        () => {

            if (welcomeStarted) {
                return;
            }


            welcomeStarted = true;


            typeWelcome();

        }
    );


    /* ================= SPINNER ================= */

    function showSpinner() {

        if (spinner) {

            spinner.classList.remove(
                "d-none"
            );

        }


        if (sendIcon) {

            sendIcon.classList.add(
                "d-none"
            );

        }


        sendBtn.disabled = true;

    }


    function hideSpinner() {

        if (spinner) {

            spinner.classList.add(
                "d-none"
            );

        }


        if (sendIcon) {

            sendIcon.classList.remove(
                "d-none"
            );

        }


        sendBtn.disabled = false;

    }


    /* ================= AI STREAM ================= */

    async function askGemini(
        userQuestion
    ) {

        showSpinner();


        try {

            const response =
                await fetch(
                    "/api/chat",
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            question:
                                userQuestion
                        })

                    }
                );


            if (!response.ok) {

                const errorText =
                    await response.text();

                throw new Error(
                    errorText ||
                    "AI response failed"
                );

            }


            /* ================= AI BOX ================= */

            const aiBox =
                document.createElement(
                    "div"
                );

            aiBox.className =
                "ai-msg msg-content";


            const aiPara =
                document.createElement(
                    "p"
                );


            aiBox.appendChild(
                aiPara
            );


            chatBox.appendChild(
                aiBox
            );


            /* ================= STREAM ================= */

            if (!response.body) {

                throw new Error(
                    "Streaming response नहीं मिला।"
                );

            }


            const reader =
                response.body.getReader();


            const decoder =
                new TextDecoder(
                    "utf-8"
                );


            let fullText = "";


            while (true) {

                const {
                    value,
                    done
                } =
                    await reader.read();


                if (done) {
                    break;
                }


                const chunk =
                    decoder.decode(
                        value,
                        {
                            stream: true
                        }
                    );


                fullText += chunk;


                aiPara.textContent =
                    fullText;


                /* AUTO SCROLL */

                chatBox.scrollTop =
                    chatBox.scrollHeight;

            }


            /* ================= FINAL CHUNK ================= */

            const finalChunk =
                decoder.decode();


            if (finalChunk) {

                fullText +=
                    finalChunk;


                aiPara.textContent =
                    fullText;

            }


        } catch (error) {

            console.error(
                "Gemini error:",
                error
            );


            const errorBox =
                document.createElement(
                    "div"
                );


            errorBox.className =
                "ai-msg msg-content";


            const errorPara =
                document.createElement(
                    "p"
                );


            errorPara.textContent =
                "माफ कीजिए, अभी AI से response नहीं मिल पाया। कृपया थोड़ी देर बाद फिर कोशिश करें।";


            errorBox.appendChild(
                errorPara
            );


            chatBox.appendChild(
                errorBox
            );


            chatBox.scrollTop =
                chatBox.scrollHeight;


        } finally {

            hideSpinner();

        }

    }


    /* ================= NORMAL MESSAGE ================= */

    sendBtn.addEventListener(
        "click",
        async () => {

            const userQuestion =
                question.value.trim();


            if (!userQuestion) {

                return;

            }


            /* USER MESSAGE */

            const userMsg =
                document.createElement(
                    "div"
                );


            userMsg.className =
                "user-msg msg-content";


            const userPara =
                document.createElement(
                    "p"
                );


            userPara.textContent =
                userQuestion;


            userMsg.appendChild(
                userPara
            );


            chatBox.appendChild(
                userMsg
            );


            /* SCROLL */

            chatBox.scrollTop =
                chatBox.scrollHeight;


            /* CLEAR INPUT */

            question.value = "";


            /* AI */

            await askGemini(
                userQuestion
            );

        }
    );


    

    

// ================= DISEASE DETAILS =================

    document.addEventListener("diseaseDetailsReady", (event) => {

        const disease = event.detail.disease;
        const crop = event.detail.crop;

        if (!disease) {
            return;
        }

        const diseaseQuestion = `
    मेरी ${crop} की फसल में ${disease} बीमारी detect हुई है।

    यह बीमारी मेरी फसल में पहले ही आ चुकी है, इसलिए मुझे केवल बीमारी के बारे में जानकारी नहीं चाहिए।

    मुझे अपनी फसल को बचाने के लिए अभी क्या करना चाहिए, यह बताइए।

    कृपया बताएं:

    1. बीमारी से फसल को क्या नुकसान हो सकता है।
    2. अभी तुरंत कौन-कौन से practical कदम उठाने चाहिए।
    3. कौन-सा appropriate pesticide/fungicide या active ingredient इस्तेमाल किया जा सकता है।
    4. Chemical treatment के साथ कौन-से अन्य effective control उपाय करने चाहिए।
    5. बीमारी को स्वस्थ पौधों में फैलने से कैसे रोकें।
    6. आगे के लिए कौन-कौन सी सावधानियां रखें।

    जहां chemical treatment लागू हो, वहां pesticide/fungicide का नाम या active ingredient बताएं, लेकिन dose और application केवल approved product label और स्थानीय कृषि विशेषज्ञ की सलाह के अनुसार बताएं।

    जवाब आसान Hindi/Hinglish में, short और practical points में दें।
    `;

        // Question सिर्फ input box में आएगा
        question.value = diseaseQuestion.trim();

        // Input box पर focus
        question.focus();

    });


    /* ================= ENTER ================= */

    question.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendBtn.click();

            }

        }
    );


});