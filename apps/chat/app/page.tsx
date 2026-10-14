import { Suspense } from "react";
import { MyAssistant } from "@/components/MyAssistant";
import { UserMenu } from "@/components/user-menu";

export default function Home() {
  return (
    <>
      <MyAssistant />
      <Suspense>
        <UserMenu />
      </Suspense>
    </>
  );
}
