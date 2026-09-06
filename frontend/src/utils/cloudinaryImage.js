// Requests a Cloudinary-hosted image at a size and compression appropriate
// for how it's actually displayed, instead of the full original upload.
// Non-Cloudinary URLs (static assets, empty values) pass through unchanged.
export function cloudinaryImage(url, width) {
  const value = String(url || "");
  if (!value.includes("res.cloudinary.com/") || !value.includes("/image/upload/"))
    return value;
  return value.replace(
    "/image/upload/",
    `/image/upload/f_auto,q_auto,c_limit,w_${width}/`,
  );
}
