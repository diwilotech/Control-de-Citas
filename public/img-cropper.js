// Recortador de imagen compartido (foto de servicio, logo del negocio) — usa Cropper.js. Se llama
// con ImgCropper.open(file, {aspectRatio}) y devuelve una Promise que resuelve con el Blob final
// (ya recortado, y relleno del color elegido si el recuadro se agrandó más allá de la foto) o con
// null si se cerró sin confirmar. viewMode:0 deja agrandar el recuadro más allá de la imagen —
// justo lo que hace falta para poder "agregar espacio en blanco/de color" alrededor de la foto.
window.ImgCropper = (function () {
  let modal = null;
  let cropper = null;
  let resolveFn = null;
  let objectUrl = null;

  function updateSize() {
    if (!cropper) return;
    const data = cropper.getData();
    document.getElementById("imgCropperSize").textContent = `${Math.round(data.width)} × ${Math.round(data.height)} px`;
  }

  function cleanup() {
    if (cropper) { cropper.destroy(); cropper = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }

  function onHidden() {
    cleanup();
    if (resolveFn) { const fn = resolveFn; resolveFn = null; fn(null); }
  }

  function init() {
    modal = new bootstrap.Modal(document.getElementById("imgCropperModal"));
    document.getElementById("imgCropperModal").addEventListener("hidden.bs.modal", onHidden);
    document.getElementById("imgCropperWhiteBtn").onclick = () => {
      document.getElementById("imgCropperFillColor").value = "#ffffff";
    };
    document.getElementById("imgCropperConfirmBtn").onclick = () => {
      if (!cropper) return;
      const fillColor = document.getElementById("imgCropperFillColor").value;
      const canvas = cropper.getCroppedCanvas({ fillColor, imageSmoothingQuality: "high" });
      canvas.toBlob((blob) => {
        const fn = resolveFn;
        resolveFn = null; // ya resolvimos acá — que hidden.bs.modal no vuelva a resolver con null
        modal.hide();
        if (fn) fn(blob);
      }, "image/png");
    };
  }

  function open(file, { aspectRatio } = {}) {
    if (!modal) init();
    return new Promise((resolve) => {
      resolveFn = resolve;
      cleanup();
      objectUrl = URL.createObjectURL(file);
      const img = document.getElementById("imgCropperImg");
      img.src = objectUrl;
      document.getElementById("imgCropperFillColor").value = "#ffffff";
      document.getElementById("imgCropperSize").textContent = "—";
      img.onload = () => {
        cropper = new Cropper(img, {
          aspectRatio: aspectRatio || NaN,
          viewMode: 0,
          autoCropArea: 1,
          background: false,
          crop: updateSize,
        });
      };
      modal.show();
    });
  }

  return { open };
})();
