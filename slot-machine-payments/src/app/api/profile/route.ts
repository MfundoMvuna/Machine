import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, getUserProfile, updateUserProfile } from "@/lib/db";

interface UpdateProfileRequest {
  userId: string;
  profileName?: string;
  profileEmail?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId parameter" }, { status: 400 });
    }

    const profile = await getUserProfile(userId);
    return NextResponse.json(profile);
  } catch (error) {
    console.error("[/api/profile] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: UpdateProfileRequest = await request.json();
    const { userId, profileName, profileEmail } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
    }

    if (profileName !== undefined && typeof profileName !== "string") {
      return NextResponse.json({ error: "profileName must be a string" }, { status: 400 });
    }

    if (profileEmail !== undefined && typeof profileEmail !== "string") {
      return NextResponse.json({ error: "profileEmail must be a string" }, { status: 400 });
    }

    if (profileEmail && !isValidEmail(profileEmail.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    await getOrCreateUser(userId);
    const updated = await updateUserProfile(userId, {
      profileName,
      profileEmail,
    });

    return NextResponse.json({
      userId: updated.id,
      profileName: updated.profileName,
      profileEmail: updated.profileEmail,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("[/api/profile] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
