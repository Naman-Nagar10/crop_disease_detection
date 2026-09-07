document.addEventListener("DOMContentLoaded", () => {

    let startCameraBtn = document.querySelector("#start-camera-btn");
    let clickBtn = document.querySelector("#click-btn");

    let video = document.querySelector("#video");
    let capturedImage = document.querySelector("#captured-image");

    let stream;


    // Start Camera
    startCameraBtn.addEventListener("click", async () => {

        try {

            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });

            video.srcObject = stream;

            video.style.display = "block";

        } catch (error) {

            console.error("Error accessing camera:", error);

            alert("Camera access nahi mil paya");

        }

    });


    // Click Photo
    clickBtn.addEventListener("click", () => {

        if (!stream) {

            alert("Camera start nahi hua hai");

            return;
        }


        let canvas = document.createElement("canvas");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;


        let context = canvas.getContext("2d");

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );


        capturedImage.src = canvas.toDataURL("image/png");

        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        stream = null;

        capturedImage.style.display = "block";

    });



    let fileInput =document.querySelector("#file-input");
    let secondLink = document.querySelector("#second-link");


    secondLink.addEventListener("click", () => {
        fileInput.click();
    });

});