import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Pages need a signed-in user. /api is checked by its own route handler (it must not be
// buffered here, request bodies carry attachments).
export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/signin", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|signin).*)"],
};
