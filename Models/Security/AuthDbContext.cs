using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ADApi.Models.Security;

public sealed class AuthDbContext(
    DbContextOptions<AuthDbContext> options)
    : IdentityDbContext<ApplicationUser, ApplicationRole, string>(options)
{
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<AuthRefreshToken> AuthRefreshTokens => Set<AuthRefreshToken>();
    public DbSet<ComponentPermission> ComponentPermissions => Set<ComponentPermission>();
    public DbSet<RoleComponentPermission> RoleComponentPermissions => Set<RoleComponentPermission>();
    public DbSet<UserComponentPermission> UserComponentPermissions => Set<UserComponentPermission>();
    public DbSet<LoginHistoryEntry> LoginHistory => Set<LoginHistoryEntry>();
    public DbSet<AuditLogEntry> AuditLogs => Set<AuditLogEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<AuthSession>(entity =>
        {
            entity.HasKey(session => session.Id);
            entity.HasIndex(session => session.UserId);
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(session => session.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AuthRefreshToken>(entity =>
        {
            entity.HasKey(token => token.Id);
            entity.HasIndex(token => token.TokenHash).IsUnique();
            entity.HasIndex(token => token.SessionId);
            entity.HasOne<AuthSession>()
                .WithMany()
                .HasForeignKey(token => token.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<ComponentPermission>(entity =>
        {
            entity.HasKey(permission => permission.Id);
            entity.Property(permission => permission.Id).HasMaxLength(100);
            entity.Property(permission => permission.Description).HasMaxLength(300);
        });

        builder.Entity<RoleComponentPermission>(entity =>
        {
            entity.HasKey(permission => new { permission.RoleId, permission.PermissionId });
            entity.HasOne<ApplicationRole>()
                .WithMany()
                .HasForeignKey(permission => permission.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ComponentPermission>()
                .WithMany()
                .HasForeignKey(permission => permission.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<UserComponentPermission>(entity =>
        {
            entity.HasKey(permission => new { permission.UserId, permission.PermissionId });
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(permission => permission.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ComponentPermission>()
                .WithMany()
                .HasForeignKey(permission => permission.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<LoginHistoryEntry>()
            .HasIndex(entry => entry.OccurredAtUtc);
        builder.Entity<AuditLogEntry>()
            .HasIndex(entry => entry.OccurredAtUtc);
    }
}
