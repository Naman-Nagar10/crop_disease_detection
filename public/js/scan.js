document.addEventListener("DOMContentLoaded", () => {

    /* ================= ELEMENTS ================= */

    const cropSelect =
        document.querySelector("#crop-select");

    const startCameraBtn =
        document.querySelector("#start-camera-btn");

    const clickBtn =
        document.querySelector("#click-btn");

    const uploadBtn =
        document.querySelector("#upload-btn");

    const uploadSpinner =
        document.querySelector("#upload-spinner");

    const uploadIcon =
        document.querySelector("#upload-icon");

    const uploadText =
        document.querySelector("#upload-text");

    const video =
        document.querySelector("#video");

    const capturedImage =
        document.querySelector("#captured-image");

    const cameraPlaceholder =
        document.querySelector("#camera-placeholder");

    const fileInput =
        document.querySelector("#file-input");

    const secondLink =
        document.querySelector("#second-link");

    const scanResult =
        document.querySelector("#scan-result");

    const cropName =
        document.querySelector("#crop-name");

    const diseaseName =
        document.querySelector("#disease-name");

    const diseaseRow =
        document.querySelector("#disease-row");

    const confidence =
        document.querySelector("#confidence");

    const detailsBtn =
        document.querySelector("#details-btn");

    const healthyMessage =
        document.querySelector("#healthy-message");

    const resultHeading =
        document.querySelector("#result-heading");


    /* ================= VARIABLES ================= */

    let stream = null;

    let capturedFile = null;

    let detectedDisease = "";

    let selectedCrop = "";


    /* ================= CROP CHANGE ================= */

    cropSelect.addEventListener("change", () => {

        selectedCrop =
            cropSelect.value;

        // Reset previous image/result

        capturedFile = null;

        detectedDisease = "";

        scanResult.classList.add("d-none");

        capturedImage.style.display = "none";

        video.style.display = "none";

        cameraPlaceholder.style.display = "flex";

        fileInput.value = "";

    });


    /* ================= START CAMERA ================= */

    startCameraBtn.addEventListener(
        "click",
        async () => {

            if (!selectedCrop) {

                alert("पहले फसल चुनें।");

                return;

            }


            try {

                // Stop previous camera

                if (stream) {

                    stream
                        .getTracks()
                        .forEach(track => track.stop());

                }


                stream =
                    await navigator.mediaDevices.getUserMedia({

                        video: {
                            facingMode: {
                                ideal: "environment"
                            }
                        },

                        audio: false

                    });


                video.srcObject =
                    stream;


                video.style.display =
                    "block";


                capturedImage.style.display =
                    "none";


                cameraPlaceholder.style.display =
                    "none";


                scanResult.classList.add(
                    "d-none"
                );


            } catch (error) {

                console.error(
                    "Camera error:",
                    error
                );

                alert(
                    "Camera access nahi mil paya. Browser permission check karein."
                );

            }

        }
    );


    /* ================= CLICK PHOTO ================= */

    clickBtn.addEventListener(
        "click",
        () => {

            if (!selectedCrop) {

                alert("पहले फसल चुनें।");

                return;

            }


            if (!stream) {

                alert(
                    "Pehle camera start karein."
                );

                return;

            }


            if (
                !video.videoWidth ||
                !video.videoHeight
            ) {

                alert(
                    "Camera abhi ready nahi hai."
                );

                return;

            }


            const canvas =
                document.createElement(
                    "canvas"
                );


            canvas.width =
                video.videoWidth;

            canvas.height =
                video.videoHeight;


            const context =
                canvas.getContext("2d");


            context.drawImage(
                video,
                0,
                0,
                canvas.width,
                canvas.height
            );


            capturedImage.src =
                canvas.toDataURL(
                    "image/jpeg",
                    0.9
                );


            canvas.toBlob(
                (blob) => {

                    if (!blob) {

                        alert(
                            "Photo capture nahi ho payi."
                        );

                        return;

                    }


                    capturedFile =
                        new File(
                            [blob],
                            "captured-image.jpg",
                            {
                                type: "image/jpeg"
                            }
                        );

                },
                "image/jpeg",
                0.9
            );


            // Stop camera

            stream
                .getTracks()
                .forEach(track => {
                    track.stop();
                });


            video.srcObject =
                null;

            stream =
                null;


            video.style.display =
                "none";


            capturedImage.style.display =
                "block";


            cameraPlaceholder.style.display =
                "none";


            scanResult.classList.add(
                "d-none"
            );

        }
    );


    /* ================= SELECT IMAGE ================= */

    secondLink.addEventListener(
        "click",
        () => {

            if (!selectedCrop) {

                alert("पहले फसल चुनें।");

                return;

            }

            fileInput.click();

        }
    );


    /* ================= FILE CHANGE ================= */

    fileInput.addEventListener(
        "change",
        () => {

            const file =
                fileInput.files[0];


            if (!file) {

                return;

            }


            capturedFile =
                file;


            const imageURL =
                URL.createObjectURL(file);


            capturedImage.src =
                imageURL;


            capturedImage.style.display =
                "block";


            video.style.display =
                "none";


            cameraPlaceholder.style.display =
                "none";


            scanResult.classList.add(
                "d-none"
            );

        }
    );


    /* ================= UPLOAD / DETECT ================= */

    uploadBtn.addEventListener(
        "click",
        async () => {

            /* Crop check */

            if (!selectedCrop) {

                alert("पहले फसल चुनें।");

                return;

            }


            const file =
                capturedFile ||
                fileInput.files[0];


            if (!file) {

                alert(
                    "पहले image capture या select करें."
                );

                return;

            }


            scanResult.classList.add(
                "d-none"
            );


            /* Loading ON */

            uploadBtn.disabled =
                true;

            uploadSpinner.classList.remove(
                "d-none"
            );

            uploadIcon.classList.add(
                "d-none"
            );

            uploadText.textContent =
                "Detecting...";


            const formData =
                new FormData();


            formData.append(
                "image",
                file
            );


            formData.append(
                "crop",
                selectedCrop
            );


            try {

                const response =
                    await fetch(
                        "/api/scan",
                        {
                            method: "POST",
                            body: formData
                        }
                    );


                const data =
                    await response.json();


                console.log(
                    "Scan response:",
                    data
                );


                if (
                    !response.ok ||
                    !data.success
                ) {

                    throw new Error(
                        data.message ||
                        "Disease detection failed"
                    );

                }


                /* ================= RESULT ================= */

                detectedDisease =
                    data.disease;


                cropName.textContent =
                    data.crop ||
                    selectedCrop;


                diseaseName.textContent =
                    data.disease;


                confidence.textContent =
                    data.confidence;


                scanResult.classList.remove(
                    "d-none"
                );


                /* ================= HEALTHY ================= */

                const isHealthy =
                    data.status === "healthy" ||
                    data.disease.toLowerCase() ===
                    "healthy";


                if (isHealthy) {

                    resultHeading.textContent =
                        " Crop Healthy";


                    diseaseRow.classList.add(
                        "d-none"
                    );


                    healthyMessage.classList.remove(
                        "d-none"
                    );


                    detailsBtn.classList.add(
                        "d-none"
                    );


                } else {

                    /* ================= DISEASE ================= */

                    resultHeading.textContent =
                        " Disease Detected";


                    diseaseRow.classList.remove(
                        "d-none"
                    );


                    healthyMessage.classList.add(
                        "d-none"
                    );


                    detailsBtn.classList.remove(
                        "d-none"
                    );

                }


                scanResult.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });


            } catch (error) {

                console.error(
                    "Scan error:",
                    error
                );


                alert(
                    "Disease detection nahi ho payi. Please try again."
                );


            } finally {

                uploadBtn.disabled =
                    false;


                uploadSpinner.classList.add(
                    "d-none"
                );


                uploadIcon.classList.remove(
                    "d-none"
                );


                uploadText.textContent =
                    "Detect";

            }

        }
    );


    /* ================= VIEW DETAILS ================= */

    detailsBtn.addEventListener(
        "click",
        () => {

            if (!detectedDisease) {

                return;

            }


            /* Healthy ko Gemini par mat bhejna */

            if (
                detectedDisease.toLowerCase() ===
                "healthy"
            ) {

                return;

            }


            /* Close Scan */

            const scanOffcanvas =
                document.querySelector(
                    "#scanOffcanvas"
                );


            const scanInstance =
                bootstrap.Offcanvas.getInstance(
                    scanOffcanvas
                );


            if (scanInstance) {

                scanInstance.hide();

            }


            /* Open Chat */

            const chatOffcanvas =
                document.querySelector(
                    "#chatOffcanvas"
                );


            if (chatOffcanvas) {

                const chat =
                    bootstrap.Offcanvas
                        .getOrCreateInstance(
                            chatOffcanvas
                        );


                chat.show();

            }


            /* Send data to chat */

            document.dispatchEvent(

                new CustomEvent(
                    "diseaseDetailsReady",
                    {
                        detail: {

                            crop:
                                selectedCrop,

                            disease:
                                detectedDisease

                        }
                    }
                )

            );

        }
    );


    /* ================= RESET ON CLOSE ================= */

    const scanOffcanvas =
        document.querySelector(
            "#scanOffcanvas"
        );


    if (scanOffcanvas) {

        scanOffcanvas.addEventListener(
            "hidden.bs.offcanvas",
            () => {

                if (stream) {

                    stream
                        .getTracks()
                        .forEach(
                            track =>
                                track.stop()
                        );

                    stream =
                        null;

                    video.srcObject =
                        null;

                }

            }
        );

    }

});