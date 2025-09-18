import { Redirect } from "expo-router";
import React from "react";

const StartPage = () => {
  // This component will immediately redirect to the / route.
  return <Redirect href="/login" />;
};

export default StartPage;
