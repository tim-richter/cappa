import { Outlet } from "react-router";
import { Header } from "./Header";

export const MainWithHeader = () => {
  return (
    <>
      <Header category="changed" count={10} />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </>
  );
};
