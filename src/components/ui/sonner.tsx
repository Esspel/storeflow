import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-coop-gray-900 group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-coop-gray-600",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-coop-gray-600",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
