export const Platform = {
  OS: "ios",
  select: <T>(opts: { ios?: T; android?: T; web?: T; default?: T }) =>
    opts.ios ?? opts.default,
};

export default { Platform };
