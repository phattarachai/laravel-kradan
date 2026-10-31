<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    #[Override]
    public function getConnection(): ?string
    {
        return config('kradan.connection');
    }

    public function up(): void
    {
        $schema = Schema::connection($this->getConnection());

        $schema->table('kradan_boards', function (Blueprint $table): void {
            $table->string('kind', 16)->default('decision')->after('task_ref')->index();
        });

        $schema->create('kradan_shares', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('board_id')->constrained('kradan_boards')->cascadeOnDelete();
            $table->foreignId('round_id')->nullable()->constrained('kradan_rounds')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('created_by', 64)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        $schema = Schema::connection($this->getConnection());

        $schema->dropIfExists('kradan_shares');

        $schema->table('kradan_boards', function (Blueprint $table): void {
            $table->dropIndex(['kind']);
            $table->dropColumn('kind');
        });
    }
};
