const { GlobalWorkerOptions, getDocument } = require("pdfjs-dist/legacy/build/pdf.mjs");
GlobalWorkerOptions.workerSrc = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
console.log("Worker src set to:", GlobalWorkerOptions.workerSrc);
