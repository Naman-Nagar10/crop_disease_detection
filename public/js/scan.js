document.addEventListener("DOMContentLoaded", () => {

    let startCameraBtn = document.querySelector("#start-camera-btn");
    let clickBtn = document.querySelector("#click-btn");

    let video = document.querySelector("#video");
    let capturedImage = document.querySelector("#captured-image");

    let stream;
    let capturedFile = null;

    let scanResult = document.querySelector("#scan-result");
    let diseaseName = document.querySelector("#disease-name");
    let confidence = document.querySelector("#confidence");


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

        canvas.toBlob((blob) => {
            capturedFile = new File([blob], "captured-image.png", {
                type: "image/png"
            });
        }, "image/png");

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



    fileInput.addEventListener("change", () => {

    let file = fileInput.files[0];

    if (!file) {
        return;
    }

    let imageURL = URL.createObjectURL(file);

    capturedImage.src = imageURL;

    capturedImage.style.display = "block";

    video.style.display = "none";

    });


    let uploadBtn = document.querySelector("#upload-btn");

    uploadBtn.addEventListener("click", async () => {

        let file = capturedFile || fileInput.files[0];

        if (!file) {
            alert("पहले image select करें।");
            return;
        }

        let formData = new FormData();

        formData.append("image", file);

        try {

            let response = await fetch("/api/scan", {
                method: "POST",
                body: formData
            });

            let data = await response.json();

            console.log(data);

            diseaseName.textContent = data.disease;
            confidence.textContent = data.confidence;

            scanResult.classList.remove("d-none");
            
        } catch (error) {

            console.log(error);

            alert("Image upload नहीं हो पाई।");

        }

    });

    console.log(req.file);

});