export const getImageUrl = (imagePath: string) => {
  return `${process.env.APP_URL}/uploads/${imagePath}`;
};

export const baseUrl = process.env.APP_URL;
