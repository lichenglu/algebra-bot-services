export const getStaticImageURL = (name: string) => {
    return `${process.env.BASE_URL}/imgs/${name}`
}