"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";

const schema = z.object({
  username: z.string().min(1, "اكتب اسم المستخدم"),
  password: z.string().min(1, "اكتب الباسورد"),
});

type FormValues = z.infer<typeof schema>;

export function PasswordForm() {
  const { invoke } = useIPC();
  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const user = await invoke("users:verifyPassword", {
        username: values.username.trim(),
        password: values.password,
      });
      if (!user) {
        toast.error("اسم المستخدم أو الباسورد غلط");
        return;
      }
      login(user);
      toast.success(`أهلاً ${user.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حصل خطأ، حاول تاني");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="username">اسم المستخدم</Label>
        <Input
          id="username"
          autoFocus
          autoComplete="username"
          placeholder="admin"
          {...register("username")}
        />
        {errors.username && (
          <p className="text-xs text-danger">{errors.username.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">الباسورد</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            className="pl-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
            tabIndex={-1}
            aria-label={showPassword ? "إخفاء الباسورد" : "إظهار الباسورد"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-danger">{errors.password.message}</p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        <LogIn className="h-5 w-5" />
        {isSubmitting ? "جاري الدخول..." : "تسجيل الدخول"}
      </Button>
    </form>
  );
}
