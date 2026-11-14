// import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ContactForm from "@/components/contact/ContactForm";

export const metadata = {
  title: "Contact Us",
  description: "Get in touch with our team.",
};

export default function ContactPage() {
  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 md:px-6">
      <Card className="shadow-lg border-0">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl md:text-4xl font-bold tracking-tight">
            Contact Us
          </CardTitle>
          <CardDescription className="text-base">
            Have questions or feedback? We'd love to hear from you.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Contact Information */}
            <div className="md:col-span-1 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">
                      support@yourbusiness.com
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">
                      +233 24 000 0000
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Office</p>
                    <p className="text-sm text-muted-foreground">
                      123 Main Street
                      <br />
                      Accra, Ghana
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Response time:</strong> Usually within 24 hours.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="md:col-span-2">
              <ContactForm />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
