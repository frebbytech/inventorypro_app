/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  UploadCloud,
  Image as ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  Link2,
} from "lucide-react";
import Image from "next/image";
import { uploadFile } from "@/lib/upload";

interface ProductImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function ProductImageUpload({
  value,
  onChange,
  disabled = false,
}: ProductImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [customUrl, setCustomUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (file: File | null) => {
    if (!file) return;

    // Client-side validations
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ];

    if (!validTypes.includes(file.type)) {
      toast.error("Invalid File Type", {
        description: "Please select a JPG, PNG, WEBP, GIF, or SVG image file.",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File Too Large", {
        description: "Image size must be under 10MB.",
      });
      return;
    }

    // console.log(file)

    try {
      setIsUploading(true);

      const result = await uploadFile({
        folder: "products",
        file,
      });
      // console.log(result)

      onChange(result.downloadURL);
      toast.success("Product Image Uploaded", {
        description: "The photo has been saved to cloud media storage.",
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Upload Failed", {
        description: err.message || "Could not save product image.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleApplyUrl = () => {
    if (!customUrl.trim()) return;
    onChange(customUrl.trim());
    toast.success("Image URL Set");
  };

  const handleRemove = () => {
    onChange(null);
    setCustomUrl("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold text-foreground">
            Product Photo
          </Label>
          <Badge
            variant="outline"
            className="text-[10px] font-medium text-muted-foreground border-muted px-1.5 py-0"
          >
            Optional
          </Badge>
        </div>

        {/* Toggle Mode: File vs URL */}
        <div className="flex items-center rounded-lg bg-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              mode === "file"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              mode === "url"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Image URL
          </button>
        </div>
      </div>

      {/* Active Preview */}
      {value ? (
        <div className="relative group flex items-center gap-4 p-3 rounded-xl border bg-card shadow-xs">
          <div className="relative h-20 w-20 rounded-lg overflow-hidden border bg-muted shrink-0 flex items-center justify-center">
            {value.startsWith("/") || value.startsWith("http") ? (
              <img
                src={value}
                alt="Product preview"
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Fallback if image load fails
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Image Attached</span>
            </div>
            <p className="text-xs text-muted-foreground truncate font-mono">
              {value}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Stored in database as{" "}
              <span className="font-semibold text-foreground">photo_url</span>
            </p>
          </div>

          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
              onClick={handleRemove}
              title="Remove image"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : mode === "file" ? (
        /* File Upload Dropzone */
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`relative cursor-pointer flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-150 ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={disabled || isUploading}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileChange(e.target.files[0]);
              }
            }}
          />

          {isUploading ? (
            <div className="flex flex-col items-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs font-semibold text-foreground">
                Uploading image...
              </p>
              <p className="text-[11px] text-muted-foreground">
                Optimizing and saving to persistent cloud media storage
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Click to select or drag & drop product photo
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  PNG, JPG, WEBP, GIF or SVG up to 10MB
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Direct URL Input */
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="url"
              placeholder="https://example.com/product-image.jpg"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="pl-9 text-xs"
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleApplyUrl}
            disabled={disabled || !customUrl.trim()}
            className="text-xs"
          >
            Apply URL
          </Button>
        </div>
      )}
    </div>
  );
}
