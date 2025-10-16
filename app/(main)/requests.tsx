"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MOCK_DROP_REQUESTS, MOCK_SWAP_REQUESTS } from "@/lib/mockData";
import { ShiftRequest } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { Link } from "expo-router";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronLeft,
  Clock,
  MapPin,
  XCircle,
} from "lucide-react-native";
// import Link from "next/link";
import { useState } from "react";

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<string>("drops");

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
      case "picked-up":
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "denied":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "pending":
        return <AlertCircle className="h-5 w-5 text-warning" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
      case "picked-up":
      case "completed":
        return "bg-success/10 text-success border-success/20";
      case "denied":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "pending":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-card text-card-foreground border-border";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "picked-up":
        return "Picked Up";
      case "pending":
        return "Pending";
      case "approved":
        return "Approved";
      case "denied":
        return "Denied";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[1440px]">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link href="/">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl border-border bg-transparent"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Drop & Swap Center
            </h1>
            <p className="text-muted-foreground">
              Manage your shift exchange requests
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="p-4 bg-card border-border rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <ArrowDownCircle className="h-5 w-5 text-warning" />
              <span className="text-sm text-muted-foreground">
                Drop Requests
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">1</div>
          </Card>

          <Card className="p-4 bg-card border-border rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">
                Swap Requests
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">1</div>
          </Card>

          <Card className="p-4 bg-card border-border rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
            <div className="text-2xl font-bold text-warning">2</div>
          </Card>

          <Card className="p-4 bg-card border-border rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <div className="text-2xl font-bold text-success">0</div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6 bg-card border border-border rounded-2xl p-1">
            <TabsTrigger
              value="drops"
              className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Drop Requests
            </TabsTrigger>
            <TabsTrigger
              value="swaps-out"
              className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Swap Requests (Out)
            </TabsTrigger>
            <TabsTrigger
              value="swaps-in"
              className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Swap Requests (In)
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Activity Feed
            </TabsTrigger>
          </TabsList>

          {/* Drop Requests Tab */}
          <TabsContent value="drops" className="space-y-4">
            {MOCK_DROP_REQUESTS.length > 0 ? (
              MOCK_DROP_REQUESTS.map((request: ShiftRequest) => (
                <Card
                  key={request.id}
                  className={`p-6 rounded-2xl border ${getStatusColor(request.status)}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      {getStatusIcon(request.status)}
                      <div>
                        <div className="text-lg font-semibold text-foreground mb-1">
                          {request.shift.role}
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {format(
                            parseISO(request.shift.date),
                            "EEEE, MMM d, yyyy"
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {request.shift.startTime} - {request.shift.endTime}
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {request.shift.location}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-2 ${
                          request.status === "pending"
                            ? "bg-warning/20 text-warning"
                            : request.status === "picked-up"
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {getStatusLabel(request.status)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Submitted{" "}
                        {format(parseISO(request.submittedAt), "MMM d")}
                      </div>
                    </div>
                  </div>

                  {request.status === "pending" && (
                    <div className="flex gap-3 pt-4 border-t border-border">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl border-border bg-transparent"
                      >
                        Cancel Request
                      </Button>
                    </div>
                  )}

                  {request.status === "picked-up" && request.pickedUpBy && (
                    <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-xl">
                      <div className="text-sm text-success">
                        Picked up by {request.pickedUpBy} on{" "}
                        {request.pickedUpAt &&
                          format(
                            parseISO(request.pickedUpAt),
                            "MMM d 'at' h:mm a"
                          )}
                      </div>
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <Card className="p-12 bg-card border-border rounded-2xl text-center">
                <ArrowDownCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No Drop Requests
                </h3>
                <p className="text-sm text-muted-foreground">
                  You haven't submitted any drop requests yet.
                </p>
              </Card>
            )}
          </TabsContent>

          {/* Swap Requests (Outgoing) Tab */}
          <TabsContent value="swaps-out" className="space-y-4">
            {MOCK_SWAP_REQUESTS.filter(
              (r: ShiftRequest) => r.direction === "outgoing"
            ).length > 0 ? (
              MOCK_SWAP_REQUESTS.filter(
                (r: ShiftRequest) => r.direction === "outgoing"
              ).map((request: ShiftRequest) => (
                <Card
                  key={request.id}
                  className={`p-6 rounded-2xl border ${getStatusColor(request.status)}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      {getStatusIcon(request.status)}
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground mb-3">
                          You're offering
                        </div>
                        <div className="p-4 bg-secondary rounded-xl mb-4">
                          <div className="text-base font-semibold text-foreground mb-1">
                            {request.shift.role}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            {format(
                              parseISO(request.shift.date),
                              "EEEE, MMM d"
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {request.shift.startTime} -{" "}
                              {request.shift.endTime}
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {request.shift.location}
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-center mb-4">
                          <ArrowRightLeft className="h-5 w-5 text-primary" />
                        </div>

                        <div className="text-sm text-muted-foreground mb-3">
                          In exchange for
                        </div>
                        <div className="p-4 bg-secondary rounded-xl">
                          <div className="text-base font-semibold text-foreground mb-1">
                            {request.theirShift?.role}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            {format(
                              parseISO(request.theirShift!.date),
                              "EEEE, MMM d"
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {request.theirShift?.startTime} -{" "}
                              {request.theirShift?.endTime}
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {request.theirShift?.location}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-2 ${
                          request.status === "pending"
                            ? "bg-warning/20 text-warning"
                            : request.status === "completed"
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {getStatusLabel(request.status)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Submitted{" "}
                        {format(parseISO(request.submittedAt), "MMM d")}
                      </div>
                    </div>
                  </div>

                  {request.status === "pending" && (
                    <div className="flex gap-3 pt-4 border-t border-border">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl border-border bg-transparent"
                      >
                        Cancel Request
                      </Button>
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <Card className="p-12 bg-card border-border rounded-2xl text-center">
                <ArrowRightLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No Outgoing Swap Requests
                </h3>
                <p className="text-sm text-muted-foreground">
                  You haven't submitted any swap requests yet.
                </p>
              </Card>
            )}
          </TabsContent>

          {/* Swap Requests (Incoming) Tab */}
          <TabsContent value="swaps-in" className="space-y-4">
            <Card className="p-12 bg-card border-border rounded-2xl text-center">
              <ArrowRightLeft className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No Incoming Swap Requests
              </h3>
              <p className="text-sm text-muted-foreground">
                No one has requested to swap shifts with you yet.
              </p>
            </Card>
          </TabsContent>

          {/* Activity Feed Tab */}
          <TabsContent value="activity" className="space-y-3">
            <Card className="p-4 bg-card border-border rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
                  <ArrowDownCircle className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground mb-1">
                    Drop request submitted
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Server shift on Jan 16 • Awaiting pickup
                  </div>
                  <div className="text-xs text-muted-foreground">
                    2 hours ago
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-card border-border rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground mb-1">
                    Swap request submitted
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Requesting to swap Jan 18 shift for Jan 20 shift
                  </div>
                  <div className="text-xs text-muted-foreground">1 day ago</div>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-card border-border rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground mb-1">
                    Drop request picked up
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Your Jan 10 shift was picked up by a coworker
                  </div>
                  <div className="text-xs text-muted-foreground">
                    3 days ago
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
