export const getNetworkAvailability = (state) => {
  if (state?.isConnected === false || state?.isInternetReachable === false) {
    return false;
  }
  if (state?.isConnected === true) return true;
  return null;
};
